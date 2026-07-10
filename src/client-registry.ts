/**
 * Vision client 工厂与 provider 注册表。
 *
 * 从 index.ts 抽出，供 server 入口与测试脚本(test-local / test-qwen)共同复用，
 * 消除各处 switch-case / 内联 registry 副本。新增 provider 只需往 CLIENT_REGISTRY 加一行。
 */

import type { VisionKitConfig } from "./config.js";
import type { VisionClient } from "./vision-client.js";
import { ZhipuClient } from "./zhipu-client.js";
import { SiliconFlowClient } from "./siliconflow-client.js";
import { QwenClient } from "./qwen-client.js";
import { VolcengineClient } from "./volcengine-client.js";
import { HunyuanClient } from "./hunyuan-client.js";
import { CustomClient } from "./custom-client.js";

/**
 * provider 名称 → client 工厂映射。
 * 新增 provider 只需在此追加一行。
 */
export const CLIENT_REGISTRY: Record<
  string,
  (config: VisionKitConfig) => VisionClient
> = {
  zhipu: (c) => new ZhipuClient(c),
  siliconflow: (c) => new SiliconFlowClient(c),
  qwen: (c) => new QwenClient(c),
  volcengine: (c) => new VolcengineClient(c),
  hunyuan: (c) => new HunyuanClient(c),
  custom: (c) => new CustomClient(c),
};

/**
 * 根据 config.provider 构造对应的 VisionClient。
 * 未识别的 provider 抛错并列出受支持列表。
 */
export function createClient(config: VisionKitConfig): VisionClient {
  const factory = CLIENT_REGISTRY[config.provider];
  if (!factory) {
    throw new Error(
      `Unsupported MODEL_PROVIDER: ${config.provider}. Supported: ${Object.keys(
        CLIENT_REGISTRY
      ).join(", ")}`
    );
  }
  return factory(config);
}
