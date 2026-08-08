/**
 * base URL 归一化：把用户填写的 base_url 解析为 { baseURL, requestPath }。
 *
 * axios 最终请求 URL = baseURL + requestPath。
 *
 * 设计铁律（覆盖小米/Kimi/DeepSeek/智谱/百炼/火山/千帆/阶跃等所有厂商，零特判）：
 * **代码只补「协议资源路径」，绝不补「版本前缀」。**
 * 版本前缀（/v1 /v2 /v3 /v4 /compatible-mode/v1）一律视为 base_url 的一部分，由用户负责，原样保留。
 * - OpenAI 协议资源路径恒为 /chat/completions（无论末尾是纯 host、/v1、/v4 还是自定义前缀）
 * - Anthropic 协议资源路径恒为 /v1/messages（无论末尾是 /anthropic、/apps/anthropic、/api/anthropic、/api/compatible 还是 /step_plan）
 *
 * 唯一需要特判的版本段是 Anthropic 末尾的精确 /v1（防 /v1/v1/messages 双重路径）。
 */

import type { Protocol } from "../config.js";
import { trimTrailingSlashes } from "../utils/helpers.js";

export interface NormalizedEndpoint {
  baseURL: string;
  requestPath: string;
}

const OPENAI_RESOURCE = "/chat/completions";
const ANTHROPIC_RESOURCE = "/v1/messages";

function stripSuffix(value: string, suffix: string): string {
  return trimTrailingSlashes(value.slice(0, -suffix.length));
}

/**
 * 按 protocol 把 rawBaseUrl 归一化为 { baseURL, requestPath }。
 *
 * - OpenAI：末尾已是 /chat/completions → 拆出前缀作 baseURL；否则 baseURL 原样、补 /chat/completions。
 * - Anthropic：末尾已是 /v1/messages → 拆出前缀；末尾精确 /v1（非 /v11）→ 剥掉补 /v1/messages；
 *   否则 baseURL 原样、补 /v1/messages。
 */
export function resolveEndpoint(rawBaseUrl: string, protocol: Protocol): NormalizedEndpoint {
  const resource = protocol === "openai" ? OPENAI_RESOURCE : ANTHROPIC_RESOURCE;
  const trimmed = trimTrailingSlashes(rawBaseUrl);

  if (trimmed.toLowerCase().endsWith(resource.toLowerCase())) {
    return { baseURL: stripSuffix(trimmed, resource), requestPath: resource };
  }
  // Anthropic 特例：末尾精确 /v1（非 /v11）→ 剥掉再补 /v1/messages，防 /v1/v1/messages。
  if (protocol === "anthropic" && /\/v1$/.test(trimmed)) {
    return { baseURL: trimTrailingSlashes(trimmed.replace(/\/v1$/, "")), requestPath: ANTHROPIC_RESOURCE };
  }
  return { baseURL: trimmed, requestPath: resource };
}
