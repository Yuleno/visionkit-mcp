import { describe, expect, it, vi } from "vitest";
import type { VisionKitConfig } from "../../src/config.js";
import type { HttpClient, HttpClientFactory, TransportConfig } from "../../src/providers/base-client.js";
import { CustomClient } from "../../src/providers/custom-client.js";
import { AnthropicClient } from "../../src/providers/anthropic-client.js";

const baseConfig: VisionKitConfig = {
  provider: "custom",
  apiKey: "test-key",
  model: "test-model",
  maxTokens: 8192,
  temperature: 0.7,
  topP: 0.95,
  enableThinking: true,
  multiCrop: true,
  multiCropMaxTiles: 5,
  capabilityOverrides: {},
  customProvider: {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
  },
  protocol: "openai",
  anthropicStrictness: "vendor-loose",
};

/** Anthropic vendor-loose（百炼/mimo 等）默认 config：base_url 命中 /apps/anthropic。 */
const anthropicConfig: VisionKitConfig = {
  ...baseConfig,
  protocol: "anthropic",
  anthropicStrictness: "vendor-loose",
  customProvider: {
    apiKey: "test-key",
    baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
    model: "qwen3.6-plus",
  },
};

function fakeTransport(responseData: unknown = { model: "fake", choices: [{ message: { content: "ok" } }] }) {
  const post = vi.fn(async () => ({ data: responseData }));
  const transports: TransportConfig[] = [];
  const factory: HttpClientFactory = (transport) => {
    transports.push(transport);
    return { post: post as HttpClient["post"] };
  };
  return { post, factory, transports };
}

describe("Custom provider 契约", () => {
  it("未知模型保守限制为单图，并在请求前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await expect(client.analyze({ images: ["a", "b"], userPrompt: "u" })).rejects.toThrow(
      /超过后端上限 1/
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("空图片请求在调用 transport 前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await expect(client.analyze({ images: [], userPrompt: "u" })).rejects.toThrow(/至少需要 1 张图片/);
    expect(post).not.toHaveBeenCalled();
  });

  it("错误统一归一化并脱敏", async () => {
    const post = vi.fn(async () => {
      throw {
        isAxiosError: true,
        message: "request failed",
        response: {
          status: 401,
          data: {
            error: {
              message: 'api-key=secret-key Authorization: Bearer bearer-secret token="token-secret" data:image/png;base64,QUJDRA==',
            },
          },
        },
      };
    });
    const client = new CustomClient(baseConfig, () => ({ post: post as HttpClient["post"] }));
    await expect(client.analyze({ images: ["image"], userPrompt: "u" })).rejects.toThrow(
      /Custom API error \(401\).*\[REDACTED\]/
    );
  });

  it("空响应按统一错误返回", async () => {
    const post = vi.fn(async () => ({ data: { choices: [{ message: { content: "   " } }] } }));
    const client = new CustomClient(baseConfig, () => ({ post: post as HttpClient["post"] }));
    await expect(client.analyze({ images: ["image"], userPrompt: "u" })).rejects.toThrow(
      /Custom API error: 响应无有效内容/
    );
  });

  it("native system prompt 独立为 system message", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig,
      capabilityOverrides: { maxImages: 2, systemPromptMode: "native" },
    }, factory);
    await client.analyze({
      images: ["image"],
      systemPrompt: "sys",
      userPrompt: "user",
      thinking: false,
    });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect((body.messages as unknown[])[0]).toEqual({ role: "system", content: "sys" });
  });

  it("merge_user 将 system prompt 合并到 user 文本", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await client.analyze({ images: ["image"], systemPrompt: "sys", userPrompt: "user" });
    const body = (post.mock.calls as unknown as [string, any][])[0][1];
    expect(body.messages[0].content.at(-1)).toEqual({ type: "text", text: "sys\n\nuser" });
  });

  it("mimo-v2.5 使用已验收的五图 profile", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig,
      model: "mimo-v2.5",
      customProvider: {
        apiKey: "mimo-secret",
        baseUrl: "https://example.test/v1",
        model: "mimo-v2.5",
      },
    }, factory);
    const result = await client.analyze({
      images: ["1", "2", "3", "4", "5"],
      userPrompt: "u",
      thinking: true,
    });
    expect(post).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([expect.stringContaining("未配置 thinking")]);
    expect(client.capabilities.maxImages).toBe(5);
  });

  it("统一使用 Bearer 鉴权，并拆分完整 Chat Completions URL", () => {
    const { factory, transports } = fakeTransport();
    new CustomClient({
      ...baseConfig,
      customProvider: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1/chat/completions",
        model: "other-model",
      },
    }, factory);
    expect(transports[0]).toMatchObject({
      baseUrl: "https://example.test/v1",
      requestPath: "/chat/completions",
      timeoutMs: 60_000,
    });
    expect(transports[0].headers.Authorization).toBe("Bearer secret");
    expect(transports[0].headers["Content-Type"]).toBe("application/json");
  });
});

describe("Anthropic provider 契约", () => {
  const anthropicResponse = {
    model: "qwen3.6-plus",
    stop_reason: "end_turn",
    content: [
      { type: "thinking", signature: "", thinking: "" },
      { type: "text", text: " 提取结果" },
    ],
  };

  it("vendor-loose 端点完整发送采样参数（temperature/top_p），不降质量", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(anthropicConfig, factory);
    await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u", thinking: true });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.95);
    // thinking enabled 时抬高 max_tokens 覆盖 budget（可见输出不挤占）
    const budget = (body.thinking as { budget_tokens: number }).budget_tokens;
    expect(body.max_tokens).toBe(8192 + budget);
    // budget 落在合法区间 [1024, max_tokens)
    expect(budget).toBeGreaterThanOrEqual(1024);
    expect(budget).toBeLessThan(8192);
    // image 块排在 text 之前
    const content = (body.messages as Array<{ content: Array<{ type: string }> }>)[0].content;
    expect(content[0].type).toBe("image");
    expect(content.at(-1)).toEqual({ type: "text", text: "u" });
    // thinking enabled 带 budget_tokens
    expect(body.thinking).toMatchObject({ type: "enabled" });
    // sendRequest 覆写为流式：post 收到的 body 含 stream:true
    expect(body.stream).toBe(true);
  });

  it("vendor-loose thinking budget 随 MAX_TOKENS 收紧，始终 < max_tokens", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(
      { ...anthropicConfig, maxTokens: 2048 },
      factory
    );
    await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u", thinking: true });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    const budget = (body.thinking as { budget_tokens: number }).budget_tokens;
    expect(budget).toBeLessThan(2048);
    expect(body.max_tokens).toBe(2048 + budget);
  });

  it("vendor-loose thinking=false 发 disabled，max_tokens 不抬高", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(anthropicConfig, factory);
    await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u", thinking: false });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(8192);
  });

  it("native system prompt 走顶层 system 字段", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(
      { ...anthropicConfig, capabilityOverrides: { maxImages: 2, systemPromptMode: "native" } },
      factory
    );
    await client.analyze({ images: ["data:image/png;base64,QUJD"], systemPrompt: "sys", userPrompt: "u" });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect(body.system).toBe("sys");
    expect((body.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0].content.at(-1)).toEqual({ type: "text", text: "u" });
  });

  it("merge_user 不发 system，systemPrompt 拼进 user 首块", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(anthropicConfig, factory);
    await client.analyze({ images: ["data:image/png;base64,QUJD"], systemPrompt: "sys", userPrompt: "user" });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect("system" in body).toBe(false);
    expect((body.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0].content.at(-1)).toEqual({ type: "text", text: "sys\n\nuser" });
  });

  it("响应解析：跳过 thinking 块、trim 前导空格", async () => {
    const { factory } = fakeTransport({
      content: [
        { type: "thinking", thinking: "内部推理不应混入" },
        { type: "text", text: " 最终答案" },
      ],
      stop_reason: "end_turn",
    });
    const client = new AnthropicClient(anthropicConfig, factory);
    const result = await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u" });
    expect(result.text).toBe("最终答案");
  });

  it("stop_reason=max_tokens 上浮截断警告", async () => {
    const { factory } = fakeTransport({
      content: [{ type: "text", text: "部分内容" }],
      stop_reason: "max_tokens",
    });
    const client = new AnthropicClient(anthropicConfig, factory);
    const result = await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u" });
    expect(result.warnings).toEqual([expect.stringContaining("max_tokens 截断")]);
  });

  it("stop_reason=refusal 上浮拒绝警告", async () => {
    const { factory } = fakeTransport({
      content: [{ type: "text", text: "拒绝" }],
      stop_reason: "refusal",
    });
    const client = new AnthropicClient(anthropicConfig, factory);
    const result = await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u" });
    expect(result.warnings).toEqual([expect.stringContaining("refusal")]);
  });

  it("空 content 抛统一错误", async () => {
    const { factory } = fakeTransport({ content: [], stop_reason: "end_turn" });
    const client = new AnthropicClient(anthropicConfig, factory);
    await expect(client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u" })).rejects.toThrow(
      /Custom API error: 响应无有效内容/
    );
  });

  it("strict 端点省略采样参数与 thinking（官方 Claude 4.7+ 回退）", async () => {
    const { factory, post } = fakeTransport(anthropicResponse);
    const client = new AnthropicClient(
      { ...anthropicConfig, anthropicStrictness: "strict" },
      factory
    );
    const result = await client.analyze({ images: ["data:image/png;base64,QUJD"], userPrompt: "u", thinking: true });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect("temperature" in body).toBe(false);
    expect("top_p" in body).toBe(false);
    expect("thinking" in body).toBe(false);
    expect(result.warnings).toEqual([expect.stringContaining("strict Anthropic 端点不支持 manual thinking")]);
  });

  it("transport 带 anthropic-version + Bearer，requestPath=/v1/messages", () => {
    const { factory, transports } = fakeTransport();
    new AnthropicClient(anthropicConfig, factory);
    expect(transports[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(transports[0].headers.Authorization).toBe("Bearer test-key");
    expect(transports[0].requestPath).toBe("/v1/messages");
    // 百炼 base_url 截到 /apps/anthropic，不带 /v1
    expect(transports[0].baseUrl).toBe("https://dashscope.aliyuncs.com/apps/anthropic");
  });

  it("qwen3.6-plus 使用已登记的 maxImages=5 profile", () => {
    const { factory } = fakeTransport();
    const client = new AnthropicClient(anthropicConfig, factory);
    expect(client.capabilities.maxImages).toBe(5);
  });
});
