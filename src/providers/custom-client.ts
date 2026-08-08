import type { VisionKitConfig } from "../config.js";
import { BaseVisionClient, resolveCustomTransport, type HttpClientFactory } from "./base-client.js";

const CUSTOM_TIMEOUT_MS = 60_000;

export class CustomClient extends BaseVisionClient {
  readonly name = "Custom";

  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    const { transport, capabilities } = resolveCustomTransport(config, "openai", { timeoutMs: CUSTOM_TIMEOUT_MS });
    super(config, transport, capabilities, httpFactory);
  }

  protected applyThinking(_body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    return thinking === true ? ["Custom provider 未配置 thinking 支持，已忽略"] : [];
  }
}
