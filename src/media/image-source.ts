import axios, { type AxiosRequestConfig } from "axios";
import { lookup } from "node:dns/promises";
import { readFile, realpath, stat } from "node:fs/promises";
import https from "node:https";
import { isIPv6 } from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { isUrl } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { assertPathInAllowedDirs, isPrivateIP } from "./security.js";
import { assertImageResolution } from "./image-transform.js";

const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const DEFAULT_REMOTE_TIMEOUT_MS = 30_000;

export function isDataUri(input: string): boolean {
  return typeof input === "string" && input.startsWith("data:") && /;base64,/.test(input);
}

function getMimeFromDataUri(input: string): string | null {
  return input.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() ?? null;
}

function estimateBytesFromDataUri(input: string): number {
  const base64 = input.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function decodeDataUri(input: string): { buffer: Buffer; mimeType: string } {
  const mimeType = ensureSupportedMimeType(getMimeFromDataUri(input));
  const base64 = input.split(",")[1] ?? "";
  if (!base64) throw new Error("Invalid Data URI: missing base64 payload");
  return { buffer: Buffer.from(base64, "base64"), mimeType };
}

export function normalizeImageSourcePath(source: string): string {
  if (!source.startsWith("@")) return source;
  const normalized = source.slice(1);
  logger.debug("Normalized @-prefixed image path", { original: source, normalized });
  return normalized;
}

function normalizeMimeType(mimeType: string | undefined | null): string | null {
  return mimeType?.split(";")[0]?.trim().toLowerCase() || null;
}

function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function ensureSupportedMimeType(mimeType: string | null): string {
  if (!mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported image format: ${mimeType || "unknown"}. Supported: ${SUPPORTED_MIME_TYPES.join(", ")}`
    );
  }
  return mimeType;
}

export interface RemoteImageDependencies {
  lookup(hostname: string): Promise<{ address: string }>;
  get(
    url: string,
    config: AxiosRequestConfig
  ): Promise<{ data: ArrayBuffer | Buffer; headers: Record<string, unknown> }>;
  createHttpsAgent(options: { servername: string }): https.Agent;
}

const DEFAULT_REMOTE_IMAGE_DEPENDENCIES: RemoteImageDependencies = {
  lookup: async (hostname) => ({ address: (await lookup(hostname)).address }),
  get: async (url, config) => {
    const response = await axios.get<ArrayBuffer>(url, config);
    return { data: response.data, headers: response.headers as Record<string, unknown> };
  },
  createHttpsAgent: (options) => new https.Agent(options),
};

export async function fetchRemoteImage(
  imageUrl: string,
  maxSizeMB = 10,
  dependencies: RemoteImageDependencies = DEFAULT_REMOTE_IMAGE_DEPENDENCIES
): Promise<{ buffer: Buffer; mimeType: string }> {
  const maxBytes = maxSizeMB * 1024 * 1024;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error(`Invalid URL: ${imageUrl}`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Unsupported remote image protocol: ${parsedUrl.protocol}`);
  }
  logger.info("Fetching remote image for preprocessing", {
    origin: parsedUrl.origin,
  });

  const hostname = parsedUrl.hostname;
  const hostnameIsIp = /^[\d.]+$/.test(hostname) || isIPv6(hostname);
  let resolvedIp: string;
  if (hostnameIsIp) {
    resolvedIp = hostname;
  } else {
    try {
      resolvedIp = (await dependencies.lookup(hostname)).address;
    } catch (error) {
      throw new Error(`Failed to resolve remote image host: ${(error as Error).message}`);
    }
  }
  if (isPrivateIP(resolvedIp)) {
    throw new Error(
      "Remote image URL points to an internal/private address. This is not allowed for security reasons."
    );
  }

  const lookupFn: NonNullable<AxiosRequestConfig["lookup"]> = (_hostname, _options, callback) => {
    callback(null, { address: resolvedIp, family: isIPv6(resolvedIp) ? 6 : 4 });
  };

  try {
    const response = await dependencies.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: DEFAULT_REMOTE_TIMEOUT_MS,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects: 0,
      lookup: lookupFn,
      httpsAgent: parsedUrl.protocol === "https:"
        ? dependencies.createHttpsAgent({ servername: hostname })
        : undefined,
    });
    const mimeType = ensureSupportedMimeType(
      normalizeMimeType(response.headers["content-type"] as string | undefined) ||
      normalizeMimeType(getMimeType(imageUrl))
    );
    const buffer = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data as ArrayBuffer);
    if (buffer.length > maxBytes) {
      throw new Error(
        `Image file too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${maxSizeMB}MB)`
      );
    }
    return { buffer, mimeType };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to fetch remote image (${error.response?.status || "unknown"}): ${error.message}`
      );
    }
    throw error;
  }
}

export async function loadImageBuffer(
  imageSource: string,
  maxSizeMB = 10
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (isDataUri(imageSource)) {
    if (estimateBytesFromDataUri(imageSource) > maxSizeMB * 1024 * 1024) {
      throw new Error(`Image file too large (max: ${maxSizeMB}MB)`);
    }
    return decodeDataUri(imageSource);
  }
  if (isUrl(imageSource)) return fetchRemoteImage(imageSource, maxSizeMB);

  const resolvedPath = path.resolve(imageSource);
  let realPath: string;
  try {
    realPath = await realpath(resolvedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Image file not found: ${resolvedPath}`);
    }
    throw error;
  }
  assertPathInAllowedDirs(realPath, [process.cwd(), os.homedir()].map((dir) => path.normalize(dir)));

  const stats = await stat(realPath);
  if (stats.size > maxSizeMB * 1024 * 1024) {
    throw new Error(
      `Image file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${maxSizeMB}MB)`
    );
  }
  return { buffer: await readFile(realPath), mimeType: ensureSupportedMimeType(getMimeType(imageSource)) };
}

export interface ValidatedImageBuffer {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export async function loadValidatedImageBuffer(
  imageSource: string,
  maxSizeMB = 10
): Promise<ValidatedImageBuffer> {
  const loaded = await loadImageBuffer(normalizeImageSourcePath(imageSource), maxSizeMB);
  const metadata = await sharp(loaded.buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Invalid image dimensions");
  await assertImageResolution(loaded.buffer);
  const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
  ensureSupportedMimeType(detectedMime);
  return { buffer: loaded.buffer, mimeType: detectedMime, width, height };
}

export async function validateImageSource(imageSource: string, maxSizeMB = 10): Promise<void> {
  const normalizedSource = normalizeImageSourcePath(imageSource);
  if (isDataUri(normalizedSource)) {
    const mimeType = ensureSupportedMimeType(getMimeFromDataUri(normalizedSource));
    const bytes = estimateBytesFromDataUri(normalizedSource);
    if (bytes > maxSizeMB * 1024 * 1024) {
      throw new Error(
        `Image file too large: ${(bytes / 1024 / 1024).toFixed(2)}MB (max: ${maxSizeMB}MB)`
      );
    }
    logger.debug("Validated Data URI image source", { mimeType, bytes });
    return;
  }
  if (isUrl(normalizedSource)) {
    const parsedUrl = new URL(normalizedSource);
    logger.debug("Image source is remote URL; validation will occur during fetch", {
      origin: parsedUrl.origin,
    });
    return;
  }

  try {
    const stats = await stat(normalizedSource);
    const sizeMB = stats.size / 1024 / 1024;
    if (sizeMB > maxSizeMB) {
      throw new Error(`Image file too large: ${sizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`);
    }
    const extension = normalizedSource.toLowerCase().split(".").pop();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error(
        `Unsupported image format: ${extension}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Image file not found: ${normalizedSource}`);
    }
    throw error;
  }
}
