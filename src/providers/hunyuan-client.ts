/** Dormant: 保留供未来 live-probe 兼容性矩阵恢复使用，见 AGENTS.md。custom-only 模式下不触达。 */
import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";

export class HunyuanClient extends BaseVisionClient {
  readonly name = "Hunyuan";
  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const transport: TransportConfig = { baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", requestPath: "/chat/completions", timeoutMs: 180_000, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" } };
    super(config, transport, resolveCapabilities("hunyuan", config.model, config.capabilityOverrides), httpFactory);
  }
  protected applyThinking(body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    if (thinking !== undefined) body.enable_thinking = thinking;
    return [];
  }
}
