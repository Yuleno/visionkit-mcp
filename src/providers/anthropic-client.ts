import type { VisionKitConfig } from "../config.js";
import { BaseVisionClient, resolveCustomTransport, type HttpClientFactory } from "./base-client.js";
import { buildAnthropicImageContent } from "./vision-client.js";
import { redactSensitiveText } from "../utils/logger.js";

const ANTHROPIC_VERSION = "2023-06-01";
// Anthropic 路径单图/多图叠加思考在非流式下需要更长超时；OpenAI 路径沿用 60s，这里放宽。
const ANTHROPIC_TIMEOUT_MS = 120_000;
// vendor-loose 端点开启 thinking 时的思维链预算上下界。最终 budget 动态取
// min(4096, maxTokens - 512)，保证 budget_tokens < max_tokens（百炼 enabled 必须满足）。
const VENDOR_LOOSE_THINKING_BUDGET_TARGET = 4096;
const VENDOR_LOOSE_THINKING_BUDGET_MIN = 1024;

/**
 * Anthropic Messages API 兼容客户端。
 *
 * 通用支持任意 Anthropic 兼容端点 + 多模态模型：阿里云百炼（qwen 系）、小米 MiMo、
 * 官方 api.anthropic.com（Claude 系）等。端点严格度（采样参数与 thinking 形态）由
 * config.anthropicStrictness 决定，与具体模型解耦：
 *
 * - vendor-loose（百炼/mimo/...）：完整复用 OpenAI 路径的 temperature/top_p，thinking 用
 *   {type:"enabled"|"disabled"}。保证视觉识别质量不回退。
 * - strict（官方 Claude 4.7+/5）：省略 temperature/top_p/top_k，thinking 字段省略（adaptive-only）。
 *
 * system 按 capabilities.systemPromptMode 处理（协议无关 flag 语义）：native→顶层 system；
 * merge_user→拼进 user 首块。image 块始终排在 text 前（Anthropic 视觉最佳实践）。
 */
export class AnthropicClient extends BaseVisionClient {
  readonly name = "Custom";
  private readonly strictness: "vendor-loose" | "strict";

  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const { transport, capabilities } = resolveCustomTransport(config, "anthropic", {
      timeoutMs: ANTHROPIC_TIMEOUT_MS,
      extraHeaders: { "anthropic-version": ANTHROPIC_VERSION },
    });
    super(config, transport, capabilities, httpFactory);
    this.strictness = config.anthropicStrictness;
  }

  protected buildBody(request: import("./vision-client.js").VisionRequest): {
    body: Record<string, unknown>;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const isStrict = this.strictness === "strict";

    // systemPromptMode 保持 flag 语义（协议无关，复用基类解析）。
    const { system, userPrompt } = this.resolveSystemPrompt(request);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.config.maxTokens,
      // image 块在 text 前（Anthropic 视觉最佳实践）。
      messages: [
        {
          role: "user",
          content: [
            ...buildAnthropicImageContent(request.images),
            { type: "text", text: userPrompt },
          ],
        },
      ],
    };

    if (system) {
      body.system = system;
    }

    if (isStrict) {
      // 官方 Claude 4.7+/5：temperature/top_p/top_k 对非默认值 400，省略。
      // thinking 为 adaptive-only：省略字段（发送 {type:"disabled"} 也会被部分新模型拒）。
      if (request.thinking === true) {
        warnings.push("strict Anthropic 端点不支持 manual thinking，已省略 thinking 字段");
      }
    } else {
      // vendor-loose（百炼/mimo/...）：完整复用采样参数，不降质量。
      body.temperature = this.config.temperature;
      body.top_p = this.config.topP;
      if (request.thinking === false) {
        body.thinking = { type: "disabled" };
      } else {
        // budget_tokens 必须 < max_tokens；动态收紧，避免用户调低 MAX_TOKENS 时 400。
        const budget = Math.max(
          VENDOR_LOOSE_THINKING_BUDGET_MIN,
          Math.min(VENDOR_LOOSE_THINKING_BUDGET_TARGET, this.config.maxTokens - 512)
        );
        // 部分端点语义下 max_tokens 是「思考+可见输出」之和；抬高 max_tokens 覆盖 budget，
        // 保证可见输出不被思考预算挤占（与 OpenAI 基线持平）。
        body.max_tokens = this.config.maxTokens + budget;
        body.thinking = { type: "enabled", budget_tokens: budget };
      }
    }

    return { body, warnings };
  }

  protected extractContent(data: unknown): string {
    const content = (data as { content?: Array<{ type?: string; text?: unknown }> | null })
      ?.content;
    if (!Array.isArray(content)) throw new Error("响应无有效内容");
    // 只取 text 块拼接，跳过 thinking / tool_use 等块；只 trim 最外层，保留块间内部缩进。
    const text = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("")
      .trim();
    if (!text) throw new Error("响应无有效内容");
    return text;
  }

  protected extractStopReasonWarning(data: unknown): string | undefined {
    const stopReason = (data as { stop_reason?: string } | undefined)?.stop_reason;
    if (stopReason === "max_tokens") return "响应被 max_tokens 截断，可能不完整";
    if (stopReason === "refusal") return "模型拒绝响应（refusal）";
    return undefined;
  }

  /**
   * 流式拉取并累积成与非流式等价的 message 结构 {content, stop_reason, model}。
   *
   * 流式不改变 MCP 对外行为（仍返回完整结果），但能显著降低首 token 等待、
   * 避免长请求（思考/多图）在非流式下整段等完或被网关超时切断。
   * SSE 事件：message_start → content_block_start/delta → message_delta(含 stop_reason) → message_stop。
   */
  protected async sendRequest(body: Record<string, unknown>): Promise<unknown> {
    const streamBody = { ...body, stream: true };
    const response = await this.http.post(this.requestPath, streamBody, {
      responseType: "stream",
    } as Parameters<typeof this.http.post>[2]);
    const data = response.data;
    // 容错：测试 fake transport 或端点忽略 stream:true 时返回普通对象，直接透传。
    if (data !== null && typeof data === "object" && !isStream(data)) {
      return data;
    }
    return consumeAnthropicStream(data as AsyncIterable<Buffer> & { on?: (e: string, cb: (d: Buffer) => void) => void });
  }
}

function isStream(value: unknown): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const v = value as { [Symbol.asyncIterator]?: unknown; on?: unknown; pipe?: unknown };
  return typeof v[Symbol.asyncIterator] === "function" || typeof v.on === "function" || typeof v.pipe === "function";
}

interface AnthropicTextBlock { type: "text"; text: string }
interface AnthropicOtherBlock { type: string; [k: string]: unknown }
type AnthropicBlock = AnthropicTextBlock | AnthropicOtherBlock;

interface AccumulatedMessage {
  content: AnthropicBlock[];
  stop_reason?: string;
  model?: string;
}

/**
 * 消费 Anthropic SSE 流，累积成与非流式响应等价的结构。
 * 容错：非流式兜底（端点忽略 stream:true 返回完整 JSON 时也能工作）。
 */
async function consumeAnthropicStream(stream: AsyncIterable<Buffer> & { on?: (e: string, cb: (d: Buffer) => void) => void }): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const message: AccumulatedMessage = { content: [] };
    const blocks: Record<number, AnthropicBlock> = {};
    let buffer = "";

    const finish = () => {
      message.content = Object.keys(blocks)
        .map(Number)
        .sort((a, b) => a - b)
        .map((i) => blocks[i])
        .filter(Boolean);
      resolve(message);
    };

    const onLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      let event: { type?: string; [k: string]: unknown };
      try {
        event = JSON.parse(payload);
      } catch {
        return; // 忽略非 JSON 行（如 ping/注释）
      }
      switch (event.type) {
        case "message_start": {
          const msg = (event as { message?: { model?: string } }).message;
          if (msg?.model) message.model = msg.model;
          break;
        }
        case "content_block_start": {
          const idx = (event as { index?: number }).index ?? 0;
          const block = (event as { content_block?: { type?: string; text?: string } }).content_block;
          if (block?.type) blocks[idx] = block as AnthropicBlock;
          break;
        }
        case "content_block_delta": {
          const idx = (event as { index?: number }).index ?? 0;
          const delta = (event as { delta?: { type?: string; text?: string } }).delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string" && blocks[idx]?.type === "text") {
            (blocks[idx] as AnthropicTextBlock).text += delta.text;
          }
          break;
        }
        case "message_delta": {
          const delta = (event as { delta?: { stop_reason?: string } }).delta;
          if (delta?.stop_reason) message.stop_reason = delta.stop_reason;
          break;
        }
        case "message_stop": {
          finish();
          break;
        }
      }
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // SSE 事件以空行分隔
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line) onLine(line);
      }
    };

    const onError = (err: unknown) => {
      reject(new Error(redactSensitiveText(`Anthropic stream failed: ${err instanceof Error ? err.message : String(err)}`)));
    };

    if (typeof stream[Symbol.asyncIterator] === "function") {
      (async () => {
        try {
          for await (const chunk of stream) onData(chunk as Buffer);
          finish();
        } catch (err) {
          onError(err);
        }
      })();
    } else if (typeof stream.on === "function") {
      stream.on("data", onData);
      stream.on("end", finish);
      stream.on("error", onError);
    } else {
      reject(new Error("Unsupported stream response from Anthropic endpoint"));
    }
  });
}
