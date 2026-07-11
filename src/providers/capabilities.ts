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
  "siliconflow/deepseek-ai/DeepSeek-OCR": { systemPromptMode: "merge_user" },
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
