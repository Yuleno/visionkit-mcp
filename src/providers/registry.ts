import type { VisionKitConfig } from "../config.js";
import { CustomClient } from "./custom-client.js";
import type { VisionClient } from "./vision-client.js";

/** custom-only：产品入口只注册 OpenAI 兼容的 custom client。 */
export const CLIENT_REGISTRY: Record<string, (config: VisionKitConfig) => VisionClient> = {
  custom: (config) => new CustomClient(config),
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
