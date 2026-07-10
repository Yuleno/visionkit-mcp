/**
 * 安全相关纯函数（从 image-processor 抽出，便于测试）
 * 期1 只移动位置，不改行为。期3 会演进为完整的 security.ts（含可注入 dns/http/fs）。
 */
import { isIPv6 } from "node:net";

/**
 * 检查 IP 地址是否为私有/内网地址（SSRF 防护用）
 */
export function isPrivateIP(ip: string): boolean {
  // IPv6 回环地址
  if (ip === "::1") {
    return true;
  }

  // IPv4-mapped IPv6 地址（如 ::ffff:127.0.0.1）
  if (isIPv6(ip)) {
    const v4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Match) {
      return isPrivateIP(v4Match[1]);
    }
    // fc00::/7 — 唯一本地地址（IPv6 私有地址）
    // fe80::/10 — 链路本地地址
    // ff00::/8 — 多播地址
    const lowerIp = ip.toLowerCase();
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lowerIp)) return true;
    if (lowerIp.startsWith("ff")) return true;
    return false;
  }

  // IPv4 地址检查
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);

  // 0.0.0.0/8
  if (first === 0) return true;
  // 127.0.0.0/8
  if (first === 127) return true;
  // 10.0.0.0/8
  if (first === 10) return true;
  // 172.16.0.0/12
  if (first === 172 && second >= 16 && second <= 31) return true;
  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;
  // 169.254.0.0/16
  if (first === 169 && second === 254) return true;
  // 100.64.0.0/10 (CGNAT)
  if (first === 100 && second >= 64 && second <= 127) return true;
  // 224.0.0.0/4 (多播)
  if (first >= 224 && first <= 239) return true;
  // 255.255.255.255 (有限广播)
  if (first === 255 && second === 255) {
    const third = parseInt(parts[2], 10);
    const fourth = parseInt(parts[3], 10);
    if (third === 255 && fourth === 255) return true;
  }

  return false;
}

/**
 * 校验真实路径是否在允许目录范围内（路径遍历/symlink 逃逸防护）。
 * 纯函数：只比较字符串，不碰 fs。realpath/readFile 由调用方先做。
 * allowedDirs 应为已 normalize + lowercase 的目录绝对路径。
 */
export function assertPathInAllowedDirs(
  realPath: string,
  allowedDirs: string[]
): void {
  const isAllowed = allowedDirs.some((dir) =>
    realPath.toLowerCase().startsWith(dir)
  );
  if (!isAllowed) {
    throw new Error(
      "Access denied: image path is outside the allowed directory"
    );
  }
}
