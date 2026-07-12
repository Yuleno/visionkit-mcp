/** Dormant: 保留供未来 live-probe 兼容性矩阵恢复使用，见 AGENTS.md。custom-only 模式下不触达。 */
import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";

export class ZhipuClient extends BaseVisionClient {
  readonly name = "GLM";
  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const transport: TransportConfig = { baseUrl: "https://open.bigmodel.cn/api/paas/v4", requestPath: "/chat/completions", timeoutMs: 60_000, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" } };
    super(config, transport, resolveCapabilities("zhipu", config.model, config.capabilityOverrides), httpFactory);
  }
  protected applyThinking(body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    if (thinking === true) body.thinking = { type: "enabled" };
    if (thinking === false) body.thinking = { type: "disabled" };
    return [];
  }
}
