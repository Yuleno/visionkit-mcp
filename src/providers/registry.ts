import type { VisionKitConfig } from "../config.js";
import { CustomClient } from "./custom-client.js";
import type { VisionClient } from "./vision-client.js";

/**
 * custom-only：注册表只暴露 custom。
 * 内置五家薄子类（zhipu/siliconflow/qwen/volcengine/hunyuan）保留为 dormant，
 * 见各文件顶部注释与 AGENTS.md，未来建立 live-probe 兼容性矩阵后再恢复。
 */
export const CLIENT_REGISTRY: Record<string, (config: VisionKitConfig) => VisionClient> = {
  custom: (config) => new CustomClient(config),
};

export function createClient(config: VisionKitConfig): VisionClient {
  const factory = CLIENT_REGISTRY[config.provider];
  if (!factory) {
    throw new Error(
      `Unsupported provider: ${config.provider}. VisionKit is custom-only; set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL. See README migration notes.`
    );
  }
  return factory(config);
}
