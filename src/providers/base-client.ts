import axios, { type AxiosInstance } from "axios";
import type { VisionKitConfig } from "../config.js";
import { logger, redactSensitiveText } from "../utils/logger.js";
import { buildImageContent, type Capabilities, type VisionClient, type VisionRequest, type VisionResult } from "./vision-client.js";

export interface TransportConfig {
  baseUrl: string;
  requestPath: string;
  timeoutMs: number;
  headers: Record<string, string>;
}

export type HttpClient = Pick<AxiosInstance, "post">;
export type HttpClientFactory = (transport: TransportConfig) => HttpClient;

export const createAxiosHttpClient: HttpClientFactory = (transport) =>
  axios.create({
    baseURL: transport.baseUrl.replace(/\/+$/, ""),
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
      const response = await this.http.post(this.requestPath, body);
      const text = this.extractContent(response.data);
      logger.info("Vision provider call successful", {
        provider: this.name,
        model: response.data?.model ?? this.model,
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

  protected buildMessages(request: VisionRequest) {
    const userPrompt = this.capabilities.systemPromptMode === "merge_user" && request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.userPrompt}`
      : request.userPrompt;
    const messages: Array<Record<string, unknown>> = [];
    if (this.capabilities.systemPromptMode === "native" && request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({
      role: "user",
      content: [...buildImageContent(request.images), { type: "text", text: userPrompt }],
    });
    return messages;
  }

  protected abstract applyThinking(body: RequestBody, thinking: boolean | undefined): string[];

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
