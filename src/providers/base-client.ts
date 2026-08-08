import axios, { type AxiosInstance } from "axios";
import type { VisionKitConfig, Protocol } from "../config.js";
import { logger, redactSensitiveText } from "../utils/logger.js";
import { trimTrailingSlashes } from "../utils/helpers.js";
import { buildImageContent, type Capabilities, type VisionClient, type VisionRequest, type VisionResult } from "./vision-client.js";
import { resolveEndpoint } from "./request-path.js";
import { resolveCapabilities } from "./capabilities.js";

export interface TransportConfig {
  baseUrl: string;
  requestPath: string;
  timeoutMs: number;
  headers: Record<string, string>;
}

/**
 * 由子类共享的 transport + capabilities 组装：守卫 customProvider、归一化端点、
 * 组装 Bearer 基线头。子类只传协议差异（超时、额外头）。
 */
export function resolveCustomTransport(
  config: VisionKitConfig,
  protocol: Protocol,
  options: { timeoutMs: number; extraHeaders?: Record<string, string> }
): { transport: TransportConfig; capabilities: Capabilities } {
  if (!config.customProvider) {
    throw new Error(
      "Vision client requires customProvider configuration. Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL environment variables."
    );
  }
  const { baseURL, requestPath } = resolveEndpoint(config.customProvider.baseUrl, protocol);
  const transport: TransportConfig = {
    baseUrl: baseURL,
    requestPath,
    timeoutMs: options.timeoutMs,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.customProvider.apiKey}`,
      ...options.extraHeaders,
    },
  };
  const capabilities = resolveCapabilities("custom", config.customProvider.model, config.capabilityOverrides);
  return { transport, capabilities };
}

export type HttpClient = Pick<AxiosInstance, "post">;
export type HttpClientFactory = (transport: TransportConfig) => HttpClient;

export const createAxiosHttpClient: HttpClientFactory = (transport) =>
  axios.create({
    baseURL: trimTrailingSlashes(transport.baseUrl),
    timeout: transport.timeoutMs,
    headers: transport.headers,
  });

type RequestBody = Record<string, unknown>;

export abstract class BaseVisionClient implements VisionClient {
  readonly model: string;
  readonly capabilities: Capabilities;
  protected readonly http: HttpClient;
  protected readonly requestPath: string;

  abstract readonly name: string;

  constructor(
    protected readonly config: VisionKitConfig,
    transport: TransportConfig,
    capabilities: Capabilities,
    httpFactory: HttpClientFactory = createAxiosHttpClient
  ) {
    this.model = config.customProvider?.model ?? config.model;
    this.capabilities = capabilities;
    this.requestPath = transport.requestPath;
    this.http = httpFactory(transport);
  }

  async analyze(request: VisionRequest): Promise<VisionResult> {
    if (request.images.length < 1) throw new Error("至少需要 1 张图片");
    if (request.images.length > this.capabilities.maxImages) {
      throw new Error(`图片数 ${request.images.length} 超过后端上限 ${this.capabilities.maxImages}`);
    }

    const { body, warnings } = this.buildBody(request);
    logger.info("Calling vision provider", {
      provider: this.name,
      model: this.model,
      imageCount: request.images.length,
      thinking: request.thinking,
    });

    try {
      const data = await this.sendRequest(body);
      const text = this.extractContent(data);
      const stopWarning = this.extractStopReasonWarning(data);
      if (stopWarning) warnings.push(stopWarning);
      logger.info("Vision provider call successful", {
        provider: this.name,
        model: (data as { model?: string } | null)?.model ?? this.model,
      });
      return { text, warnings: warnings.length ? warnings : undefined };
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.error("Vision provider call failed", { provider: this.name, error: normalized.message });
      throw normalized;
    }
  }

  getModelName(): string {
    return `${this.name} (${this.model})`;
  }

  protected buildBody(request: VisionRequest): { body: RequestBody; warnings: string[] } {
    const body: RequestBody = {
      model: this.model,
      messages: this.buildMessages(request),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      top_p: this.config.topP,
      stream: false,
    };
    return { body, warnings: this.applyThinking(body, request.thinking) };
  }

  /**
   * 按 systemPromptMode 解析出协议中立的 system 文本与 user prompt。
   * - native：system 独立、userPrompt 原样
   * - merge_user：system 为空、systemPrompt 前缀拼进 userPrompt
   * 子类据此渲染到各自协议字段（OpenAI system message / Anthropic 顶层 system）。
   */
  protected resolveSystemPrompt(request: VisionRequest): { system: string | undefined; userPrompt: string } {
    if (this.capabilities.systemPromptMode === "merge_user" && request.systemPrompt) {
      return { system: undefined, userPrompt: `${request.systemPrompt}\n\n${request.userPrompt}` };
    }
    return { system: request.systemPrompt, userPrompt: request.userPrompt };
  }

  protected buildMessages(request: VisionRequest) {
    const { system, userPrompt } = this.resolveSystemPrompt(request);
    const messages: Array<Record<string, unknown>> = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({
      role: "user",
      content: [...buildImageContent(request.images), { type: "text", text: userPrompt }],
    });
    return messages;
  }

  protected applyThinking(body: RequestBody, thinking: boolean | undefined): string[] {
    return [];
  }

  /**
   * 发送请求并返回响应数据。默认走非流式 POST；AnthropicClient 可覆写为流式累积。
   * 覆写时返回的对象形态应与 extractContent/extractStopReasonWarning 期望一致。
   */
  protected async sendRequest(body: RequestBody): Promise<unknown> {
    const response = await this.http.post(this.requestPath, body);
    return response.data;
  }

  /**
   * 从响应中提取截断/异常停止的警告（如 Anthropic stop_reason==="max_tokens"）。
   * 默认 no-op（OpenAI 路径不读 finish_reason）；Anthropic 子类可覆写。
   */
  protected extractStopReasonWarning(_data: unknown): string | undefined {
    return undefined;
  }

  protected extractContent(data: unknown): string {
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("响应无有效内容");
    }
    return content;
  }

  protected normalizeError(error: unknown): Error {
    const axiosError = axios.isAxiosError(error);
    const status = axiosError ? error.response?.status : undefined;
    const apiMessage = axiosError
      ? (error.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message ?? error.message
      : error instanceof Error ? error.message : String(error);
    const safeMessage = redactSensitiveText(String(apiMessage));
    return new Error(`${this.name} API error${status ? ` (${status})` : ""}: ${safeMessage}`);
  }
}

export { redactSensitiveText };
