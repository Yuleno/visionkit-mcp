import type { VisionKitConfig } from "../config.js";
import { CustomClient } from "./custom-client.js";
import { HunyuanClient } from "./hunyuan-client.js";
import { QwenClient } from "./qwen-client.js";
import { SiliconFlowClient } from "./siliconflow-client.js";
import { VolcengineClient } from "./volcengine-client.js";
import type { VisionClient } from "./vision-client.js";
import { ZhipuClient } from "./zhipu-client.js";

export const CLIENT_REGISTRY: Record<string, (config: VisionKitConfig) => VisionClient> = {
  zhipu: (config) => new ZhipuClient(config),
  siliconflow: (config) => new SiliconFlowClient(config),
  qwen: (config) => new QwenClient(config),
  volcengine: (config) => new VolcengineClient(config),
  hunyuan: (config) => new HunyuanClient(config),
  custom: (config) => new CustomClient(config),
};

export function createClient(config: VisionKitConfig): VisionClient {
  const factory = CLIENT_REGISTRY[config.provider];
  if (!factory) {
    throw new Error(`Unsupported MODEL_PROVIDER: ${config.provider}. Supported: ${Object.keys(CLIENT_REGISTRY).join(", ")}`);
  }
  return factory(config);
}
