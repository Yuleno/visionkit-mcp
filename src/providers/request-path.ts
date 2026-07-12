/**
 * 把用户填写的 base URL 归一化为 { baseURL, requestPath }。
 *
 * axios 请求 URL = baseURL + requestPath。若用户把完整 URL
 * .../v1/chat/completions 当作 base，直接固定 requestPath=/chat/completions
 * 会拼成 .../v1/chat/completions/chat/completions 导致 404。
 * 因此当 base 已含 /chat/completions 时拆出前缀作为 baseURL。
 */
export interface NormalizedEndpoint {
  baseURL: string;
  requestPath: string;
}

const CHAT_COMPLETIONS = "/chat/completions";

export function normalizeEndpoint(rawBaseUrl: string): NormalizedEndpoint {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, "");
  const suffix = CHAT_COMPLETIONS;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
    return { baseURL: trimmed.slice(0, -suffix.length).replace(/\/+$/, ""), requestPath: suffix };
  }
  return { baseURL: trimmed, requestPath: suffix };
}
