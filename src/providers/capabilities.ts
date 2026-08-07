import type { CapabilityOverrides } from "../config.js";
import type { Capabilities } from "./vision-client.js";

export const DEFAULT_CAPABILITIES: Capabilities = {
  maxImages: 1,
  nativeVideo: false,
  toolCalling: false,
  grounding: false,
  systemPromptMode: "merge_user",
};

/** 只登记已验证或有明确文档依据的差异；未知能力保持保守回退。 */
export const CAPABILITY_PROFILES: Record<string, Partial<Capabilities>> = {
  "custom/mimo-v2.5": { maxImages: 5, systemPromptMode: "merge_user" },
  // 阿里云百炼 qwen3.6-plus：原生多模态视觉模型，URL 上限 256 图、Base64 上限 250 图，
  // 5 远低于上限。协议无关能力（OpenAI/Anthropic 路径通用）。
  "custom/qwen3.6-plus": { maxImages: 5 },
};

export function resolveCapabilities(
  provider: string,
  model: string,
  overrides: CapabilityOverrides = {}
): Capabilities {
  return {
    ...DEFAULT_CAPABILITIES,
    ...CAPABILITY_PROFILES[`${provider}/${model}`],
    ...overrides,
  };
}
