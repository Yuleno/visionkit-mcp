/**
 * 日志工具
 * 将日志输出到 stderr，避免污染 MCP 的 stdout JSON 通信
 */

import { mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';

const SENSITIVE_KEY_PATTERN = /(api[-_]?key|authorization|token|secret|password)/i;

export function redactSensitiveText(value: string): string {
  return value
    .replace(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:image/[REDACTED]")
    .replace(/(Authorization\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(
      /(["']?(?:api[-_]?key|authorization|token|secret|password)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1[REDACTED]"
    );
}

export function redactLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactLogValue(item),
    ]));
  }
  return value;
}

export function getDefaultLogDirectory(
  baseDir: string = process.cwd()
): string {
  return join(baseDir, '.visionkit-mcp', 'logs');
}

class Logger {
  private logFilePath?: string;

  constructor() {
    this.initLogFile();
  }

  private initLogFile() {
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const logDir = getDefaultLogDirectory();
      
      mkdirSync(logDir, { recursive: true });
      this.logFilePath = join(logDir, `visionkit-mcp-${dateStr}.log`);
    } catch (error) {
      // 如果无法创建日志文件，只输出到 stderr
      process.stderr.write(`[WARN] Failed to initialize log file: ${error}\n`);
    }
  }

  private async write(level: string, message: string, ...args: any[]): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const argsStr = args.length > 0 ? ` ${JSON.stringify(redactLogValue(args))}` : '';
      const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}${argsStr}`;

      // 输出到 stderr
      process.stderr.write(logMessage + '\n');

      // 异步写入日志文件（不阻塞事件循环）
      if (this.logFilePath) {
        try {
          await appendFile(this.logFilePath, logMessage + '\n');
        } catch {
          // 文件写入失败，静默忽略
        }
      }
    } catch (error) {
      // 防御兜底：日志写不出绝不能让进程崩
      try {
        process.stderr.write(
          `[LOGGER-INTERNAL-ERROR] ${error instanceof Error ? error.message : String(error)}\n`
        );
      } catch {
        // 最后的最后，沉默
      }
    }
  }

  async info(message: string, ...args: any[]) {
    await this.write('info', message, ...args);
  }

  async error(message: string, ...args: any[]) {
    await this.write('error', message, ...args);
  }

  async warn(message: string, ...args: any[]) {
    await this.write('warn', message, ...args);
  }

  async debug(message: string, ...args: any[]) {
    await this.write('debug', message, ...args);
  }
}

export const logger = new Logger();

/**
 * 重定向 console 到 logger，避免污染 stdout
 */
export function setupConsoleRedirection() {
  console.log = logger.info.bind(logger);
  console.info = logger.info.bind(logger);
  console.error = logger.error.bind(logger);
  console.warn = logger.warn.bind(logger);
  console.debug = logger.debug.bind(logger);
}
