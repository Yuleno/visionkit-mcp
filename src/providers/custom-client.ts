import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";
import { normalizeEndpoint } from "./request-path.js";

const CUSTOM_TIMEOUT_MS = 60_000;

export class CustomClient extends BaseVisionClient {
  readonly name = "Custom";

  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    if (!config.customProvider) {
      throw new Error(
        "CustomClient requires customProvider configuration. Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL environment variables."
      );
    }
    const { baseURL, requestPath } = normalizeEndpoint(config.customProvider.baseUrl);
    const transport: TransportConfig = {
      baseUrl: baseURL,
      requestPath,
      timeoutMs: CUSTOM_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.customProvider.apiKey}`,
      },
    };
    super(
      config,
      transport,
      resolveCapabilities("custom", config.customProvider.model, config.capabilityOverrides),
      httpFactory
    );
  }

  protected applyThinking(_body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    return thinking === true ? ["Custom provider 未配置 thinking 支持，已忽略"] : [];
  }
}
