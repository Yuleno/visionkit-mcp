import type { CustomProviderConfig, VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";

export class CustomClient extends BaseVisionClient {
  readonly name = "Custom";
  private readonly customConfig: CustomProviderConfig;

  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    if (!config.customProvider) {
      throw new Error("CustomClient requires customProvider configuration. Set MODEL_PROVIDER=custom and provide CUSTOM_* environment variables.");
    }
    const customConfig = config.customProvider;
    const transport: TransportConfig = {
      baseUrl: customConfig.baseUrl,
      requestPath: customConfig.path,
      timeoutMs: customConfig.timeoutMs,
      headers: buildHeaders(customConfig),
    };
    super(config, transport, resolveCapabilities("custom", customConfig.model, config.capabilityOverrides), httpFactory);
    this.customConfig = customConfig;
  }

  protected applyThinking(body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    if (this.customConfig.thinkingMode === "disabled") {
      return thinking === true ? ["Custom provider 未配置 thinking 支持，已忽略"] : [];
    }
    if (this.customConfig.thinkingMode === "openai") {
      if (thinking !== undefined) body.enable_thinking = thinking;
      return [];
    }
    if (thinking !== undefined) body.extra_body = { enable_thinking: thinking };
    return [];
  }
}

function buildHeaders(config: CustomProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authHeader === "bearer") {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else if (config.authHeader === "x-api-key") {
    headers["x-api-key"] = config.apiKey;
  } else {
    const template = (config.authHeaderValue ?? "").replace(/\{\{key\}\}/g, config.apiKey);
    const colon = template.indexOf(":");
    if (colon > 0) {
      headers[template.slice(0, colon).trim()] = template.slice(colon + 1).trim();
    } else if (template) {
      headers[template] = config.apiKey;
    }
  }
  return headers;
}
