/**
 * 媒体读取的安全边界。纯函数保持可确定性测试，I/O 由 image-source 注入/调用。
 */
import path from "node:path";
import { isIPv6 } from "node:net";

export function isPrivateIP(ip: string): boolean {
  if (ip === "::1") return true;
  if (isIPv6(ip)) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateIP(mapped[1]);
    const normalized = ip.toLowerCase();
    return normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff");
  }
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second, third, fourth] = parts;
  return first === 0 || first === 10 || first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first >= 224 && first <= 239) ||
    (first === 255 && second === 255 && third === 255 && fourth === 255);
}

/**
 * 使用 relative 判断目录归属，避免 `C:\\work` 错放行 `C:\\work-evil` 的前缀绕过。
 * 对单元测试中的 POSIX/Windows 风格路径均可工作。
 */
export function assertPathInAllowedDirs(realPath: string, allowedDirs: readonly string[]): void {
  const allowed = allowedDirs.some((dir) => isPathInside(realPath, dir));
  if (!allowed) throw new Error("Access denied: image path is outside the allowed directory");
}

function isPathInside(target: string, root: string): boolean {
  const isWindowsPath = /^[a-z]:\\/i.test(target) || /^[a-z]:\\/i.test(root);
  const pathApi = isWindowsPath ? path.win32 : path.posix;
  const resolvedTarget = pathApi.resolve(target);
  const resolvedRoot = pathApi.resolve(root);
  const normalizedTarget = isWindowsPath ? resolvedTarget.toLowerCase() : resolvedTarget;
  const normalizedRoot = isWindowsPath ? resolvedRoot.toLowerCase() : resolvedRoot;
  const relative = pathApi.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!relative.startsWith("..") && !pathApi.isAbsolute(relative));
}
