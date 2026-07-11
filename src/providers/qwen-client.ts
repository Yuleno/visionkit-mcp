import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";

export class QwenClient extends BaseVisionClient {
  readonly name = "Qwen";
  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const transport: TransportConfig = { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", requestPath: "/chat/completions", timeoutMs: 180_000, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" } };
    super(config, transport, resolveCapabilities("qwen", config.model, config.capabilityOverrides), httpFactory);
  }
  protected applyThinking(body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    if (thinking === true) body.extra_body = { enable_thinking: true, thinking_budget: 81920 };
    if (thinking === false) body.extra_body = { enable_thinking: false };
    return [];
  }
}
