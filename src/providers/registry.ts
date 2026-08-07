import type { VisionKitConfig } from "../config.js";
import { CustomClient } from "./custom-client.js";
import { AnthropicClient } from "./anthropic-client.js";
import type { VisionClient } from "./vision-client.js";

/**
 * custom-only：产品入口按 config.protocol 选择 OpenAI 或 Anthropic transport。
 * - openai: CustomClient（OpenAI Chat Completions 兼容端点）。
 * - anthropic: AnthropicClient（Anthropic Messages 兼容端点，支持百炼/mimo/官方等任意多模态模型）。
 */
export const CLIENT_REGISTRY: Record<string, (config: VisionKitConfig) => VisionClient> = {
  custom: (config) => (config.protocol === "anthropic" ? new AnthropicClient(config) : new CustomClient(config)),
};

export function createClient(config: VisionKitConfig): VisionClient {
  const factory = CLIENT_REGISTRY[config.provider];
  if (!factory) {
    throw new Error(
      `Unsupported provider: ${config.provider}. VisionKit is custom-only; set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL. See the README configuration section.`
    );
  }
  return factory(config);
}
