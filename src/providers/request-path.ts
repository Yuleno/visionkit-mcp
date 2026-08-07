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

export interface NormalizedEndpoint {
  baseURL: string;
  requestPath: string;
}

export type Protocol = "openai" | "anthropic";

const OPENAI_RESOURCE = "/chat/completions";
const ANTHROPIC_RESOURCE = "/v1/messages";

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

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
  const trimmed = trimTrailingSlashes(rawBaseUrl);

  if (protocol === "openai") {
    if (trimmed.toLowerCase().endsWith(OPENAI_RESOURCE.toLowerCase())) {
      return { baseURL: stripSuffix(trimmed, OPENAI_RESOURCE), requestPath: OPENAI_RESOURCE };
    }
    return { baseURL: trimmed, requestPath: OPENAI_RESOURCE };
  }

  // protocol === "anthropic"
  if (trimmed.endsWith(ANTHROPIC_RESOURCE)) {
    return { baseURL: stripSuffix(trimmed, ANTHROPIC_RESOURCE), requestPath: ANTHROPIC_RESOURCE };
  }
  // 末尾精确 /v1（不误伤 /v11 /v12）→ 剥掉再补 /v1/messages，防 /v1/v1/messages。
  if (/\/v1$/.test(trimmed)) {
    return { baseURL: trimmed.replace(/\/v1$/, "").replace(/\/+$/, ""), requestPath: ANTHROPIC_RESOURCE };
  }
  return { baseURL: trimmed, requestPath: ANTHROPIC_RESOURCE };
}
