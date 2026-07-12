/** Dormant: 保留供未来 live-probe 兼容性矩阵恢复使用，见 AGENTS.md。custom-only 模式下不触达。 */
import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";

export class SiliconFlowClient extends BaseVisionClient {
  readonly name = "DeepSeek";
  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const transport: TransportConfig = { baseUrl: "https://api.siliconflow.cn/v1", requestPath: "/chat/completions", timeoutMs: 60_000, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" } };
    super(config, transport, resolveCapabilities("siliconflow", config.model, config.capabilityOverrides), httpFactory);
  }
  protected applyThinking(_body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    return thinking === true ? ["SiliconFlow/DeepSeek-OCR 不支持 thinking，已忽略"] : [];
  }
  protected override buildBody(request: import("./vision-client.js").VisionRequest) {
    const result = super.buildBody(request);
    result.body.max_tokens = Math.min(this.config.maxTokens, 4096);
    return result;
  }
}
