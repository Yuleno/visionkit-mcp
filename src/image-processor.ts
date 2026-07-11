/**
 * 图片处理工具
 * 读取、验证、压缩并编码图片（本地文件、远程 URL、Data URI）
 */

import axios, { type AxiosRequestConfig } from "axios";
import { readFile, stat, realpath } from "fs/promises";
import { lookup } from "dns/promises";
import { isIPv6 } from "net";
import { createHash } from "crypto";
import https from "https";
import os from "os";
import path from "path";
import sharp from "sharp";
import { isUrl } from "./utils/helpers.js";
import { logger } from "./utils/logger.js";
import { isPrivateIP, assertPathInAllowedDirs } from "./media/security.js";

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const DEFAULT_REMOTE_TIMEOUT_MS = 30000;
const MAX_PIXEL_COUNT = 16_000_000;

// 图片压缩参数常量
const COMPRESS_MAX_DIMENSION_TEXT = 3072;
const COMPRESS_MAX_DIMENSION_GENERAL = 2048;
const COMPRESS_QUALITY_TEXT = 90;
const COMPRESS_QUALITY_GENERAL = 85;
const COMPRESS_PNG_LEVEL_TEXT = 3;
const COMPRESS_PNG_LEVEL_GENERAL = 6;

// 图片裁剪阈值常量
const CROP_MIN_DIMENSION = 1800;
const CROP_MIN_PIXEL_COUNT = 3_500_000;

// 压缩触发阈值
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;

// 判断输入是否为 Data URI（data:image/png;base64,...）
function isDataUri(input: string): boolean {
  return (
    typeof input === "string" &&
    input.startsWith("data:") &&
    /;base64,/.test(input)
  );
}

// 从 Data URI 提取 mimeType
function getMimeFromDataUri(input: string): string | null {
  const match = input.match(/^data:([^;]+);base64,/i);
  return match ? match[1].toLowerCase() : null;
}

// 估算 Data URI 的原始字节大小（不含头部）
function estimateBytesFromDataUri(input: string): number {
  try {
    const base64 = input.split(",")[1] || "";
    // base64 长度 * 3/4，忽略 padding 进行近似计算
    return Math.floor((base64.length * 3) / 4);
  } catch {
    return 0;
  }
}

// 解码 Data URI，纳入统一的图片预处理流程
function decodeDataUri(input: string): { buffer: Buffer; mimeType: string } {
  const mimeType = ensureSupportedMimeType(getMimeFromDataUri(input));
  const base64 = input.split(",")[1] || "";

  if (!base64) {
    throw new Error("Invalid Data URI: missing base64 payload");
  }

  return {
    buffer: Buffer.from(base64, "base64"),
    mimeType,
  };
}

/**
 * 规范化本地图片路径（例如移除前缀符号）
 * 部分客户端使用 "@path/to/file" 引用，需要转为真实路径
 */
function normalizeImageSourcePath(source: string): string {
  if (typeof source === "string" && source.startsWith("@")) {
    const normalized = source.slice(1);
    logger.debug("Normalized @-prefixed image path", {
      original: source,
      normalized,
    });
    return normalized;
  }
  return source;
}

// 规范化 MIME 类型，移除 charset 等附加信息
function normalizeMimeType(mimeType: string | undefined | null): string | null {
  if (!mimeType) {
    return null;
  }

  return mimeType.split(";")[0].trim().toLowerCase() || null;
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();

  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg"; // 默认使用 jpeg
  }
}

// 校验 MIME 类型是否在允许范围内
function ensureSupportedMimeType(mimeType: string | null): string {
  if (!mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported image format: ${mimeType || "unknown"}. Supported: ${SUPPORTED_MIME_TYPES.join(
        ", "
      )}`
    );
  }

  return mimeType;
}

/**
 * 拉取远程图片并纳入统一预处理流程
 */
export interface RemoteImageDependencies {
  lookup(hostname: string): Promise<{ address: string }>;
  get(
    url: string,
    config: AxiosRequestConfig
  ): Promise<{ data: ArrayBuffer | Buffer; headers: Record<string, unknown> }>;
  createHttpsAgent(options: { servername: string }): https.Agent;
}

const DEFAULT_REMOTE_IMAGE_DEPENDENCIES: RemoteImageDependencies = {
  lookup: async (hostname) => {
    const result = await lookup(hostname);
    return { address: result.address };
  },
  get: async (url, config) => {
    const response = await axios.get<ArrayBuffer>(url, config);
    return {
      data: response.data,
      headers: response.headers as Record<string, unknown>,
    };
  },
  createHttpsAgent: (options) => new https.Agent(options),
};

export async function fetchRemoteImage(
  imageUrl: string,
  maxSizeMB: number = 10,
  dependencies: RemoteImageDependencies = DEFAULT_REMOTE_IMAGE_DEPENDENCIES
): Promise<{ buffer: Buffer; mimeType: string }> {
  const maxBytes = maxSizeMB * 1024 * 1024;

  logger.info("Fetching remote image for preprocessing", { url: imageUrl });

  // SSRF 防护：解析 URL 的 hostname 并检查是否为私有/内网地址
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error(`Invalid URL: ${imageUrl}`);
  }

  const hostname = parsedUrl.hostname;

  // 判断 hostname 是否为 IP 地址格式
  const isHostnameIp = /^[\d.]+$/.test(hostname) || isIPv6(hostname);

  let resolvedIp: string;
  if (isHostnameIp) {
    resolvedIp = hostname;
  } else {
    // DNS 解析域名到 IP
    try {
      const dnsResult = await dependencies.lookup(hostname);
      resolvedIp = dnsResult.address;
    } catch (dnsError) {
      throw new Error(
        `Failed to resolve remote image host: ${(dnsError as Error).message}`
      );
    }
  }

  if (isPrivateIP(resolvedIp)) {
    throw new Error(
      "Remote image URL points to an internal/private address. This is not allowed for security reasons."
    );
  }

  // 用 lookup 函数返回预验证 IP + HTTPS 时设 servername，确保 SNI 走原域名
  const isHttps = parsedUrl.protocol === "https:";
  const lookupFn: NonNullable<
    import("axios").AxiosRequestConfig["lookup"]
  > = (_hostname, _options, callback) => {
    callback(null, {
      address: resolvedIp,
      family: isIPv6(resolvedIp) ? 6 : 4,
    });
  };

  try {
    const response = await dependencies.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: DEFAULT_REMOTE_TIMEOUT_MS,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects: 0, // 禁用重定向防 SSRF 绕过
      lookup: lookupFn,
      httpsAgent: isHttps
        ? dependencies.createHttpsAgent({ servername: parsedUrl.hostname })
        : undefined,
    });

    const mimeType = ensureSupportedMimeType(
      normalizeMimeType(response.headers["content-type"] as string | undefined) ||
        normalizeMimeType(getMimeType(imageUrl))
    );
    const data = response.data;
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);

    if (buffer.length > maxBytes) {
      throw new Error(
        `Image file too large: ${(buffer.length / (1024 * 1024)).toFixed(
          2
        )}MB (max: ${maxSizeMB}MB)`
      );
    }

    return { buffer, mimeType };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      throw new Error(
        `Failed to fetch remote image (${status || "unknown"}): ${error.message}`
      );
    }

    throw error;
  }
}

/**
 * 读取本地或远程图片二进制数据
 */
async function loadImageBuffer(
  imageSource: string,
  maxSizeMB: number = 10
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (isDataUri(imageSource)) {
    if (estimateBytesFromDataUri(imageSource) > maxSizeMB * 1024 * 1024) {
      throw new Error(`Image file too large (max: ${maxSizeMB}MB)`);
    }
    return decodeDataUri(imageSource);
  }

  if (isUrl(imageSource)) {
    return fetchRemoteImage(imageSource, maxSizeMB);
  }

  // 路径遍历防护：将用户路径解析为绝对路径并校验是否在允许的范围内
  const resolvedPath = path.resolve(imageSource);

  // 解析符号链接，得到真实物理路径（防止 symlink 越界）
  let realPath: string;
  try {
    realPath = await realpath(resolvedPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Image file not found: ${resolvedPath}`);
    }
    throw err;
  }

  const allowedDirs = [process.cwd(), os.homedir()].map((dir) =>
    path.normalize(dir)
  );

  assertPathInAllowedDirs(realPath, allowedDirs);

  const stats = await stat(realPath);
  if (stats.size > maxSizeMB * 1024 * 1024) {
    throw new Error(`Image file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${maxSizeMB}MB)`);
  }
  const buffer = await readFile(realPath);
  const mimeType = ensureSupportedMimeType(getMimeType(imageSource));
  return { buffer, mimeType };
}

export interface ValidatedImageBuffer {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/** 一次读取并完成格式、大小与像素校验，供期4 LoadedMedia 复用。 */
export async function loadValidatedImageBuffer(
  imageSource: string,
  maxSizeMB: number = 10
): Promise<ValidatedImageBuffer> {
  const normalizedSource = normalizeImageSourcePath(imageSource);
  const loaded = await loadImageBuffer(normalizedSource, maxSizeMB);
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (loaded.buffer.length > maxBytes) {
    throw new Error(`Image file too large: ${(loaded.buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${maxSizeMB}MB)`);
  }
  const metadata = await sharp(loaded.buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Invalid image dimensions");
  await checkImageResolution(loaded.buffer);
  const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
  ensureSupportedMimeType(detectedMime);
  return { buffer: loaded.buffer, mimeType: detectedMime, width, height };
}

/**
 * 校验图片来源（文件或 URL）
 */
export async function validateImageSource(
  imageSource: string,
  maxSizeMB: number = 10
): Promise<void> {
  // 规范化本地路径（处理可能的前缀符号，如 "@image.png"）
  const normalizedSource = normalizeImageSourcePath(imageSource);

  if (isDataUri(normalizedSource)) {
    const mimeType = ensureSupportedMimeType(getMimeFromDataUri(normalizedSource));
    const bytes = estimateBytesFromDataUri(normalizedSource);
    const maxBytes = maxSizeMB * 1024 * 1024;

    if (bytes > maxBytes) {
      throw new Error(
        `Image file too large: ${(bytes / (1024 * 1024)).toFixed(
          2
        )}MB (max: ${maxSizeMB}MB)`
      );
    }

    logger.debug("Validated Data URI image source", { mimeType, bytes });
    return;
  }

  if (isUrl(normalizedSource)) {
    logger.debug("Image source is remote URL; validation will occur during fetch", {
      url: normalizedSource,
    });
    return;
  }

  // 校验本地文件
  try {
    const stats = await stat(normalizedSource);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
      throw new Error(
        `Image file too large: ${fileSizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`
      );
    }

    const ext = normalizedSource.toLowerCase().split(".").pop();

    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(
        `Unsupported image format: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(
          ", "
        )}`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Image file not found: ${normalizedSource}`);
    }
    throw error;
  }
}

/**
 * 将图片转为 base64 Data URL
 */
export async function imageToBase64(imagePath: string): Promise<string> {
  return imageToBase64WithOptions(imagePath);
}

export interface PreparedImageInput {
  imageData: string | string[];
  imageHint?: string;
  /**
   * 预处理后最终是否走了文本优先路径。
   * 当调用方未显式指定 preferText 时，由图片启发式自动推断，此字段把该决策回流给上层。
   */
  preferTextUsed: boolean;
}

/**
 * 简单 LRU 缓存，避免同一图片重复处理
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移动到末尾（最新的位置）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最旧的（Map 的第一个 entry）
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * 生成缓存 key
 * - 短路径保留可读性（调试友好）
 * - 长输入（Data URI / 大 URL）走 SHA-256 摘要，避免内存膨胀
 */
function makeCacheKey(normalizedPath: string, options: unknown): string {
  const optionsStr = JSON.stringify(options ?? {});
  if (normalizedPath.length <= 256 && !isDataUri(normalizedPath)) {
    return `${normalizedPath}::${optionsStr}`;
  }
  const hash = createHash("sha256");
  hash.update(normalizedPath);
  hash.update(optionsStr);
  return `sha256:${hash.digest("hex")}`;
}

// 模块级 LRU 缓存实例，避免同一图片重复处理
const imageCache = new LRUCache<string, PreparedImageInput>(100);

/**
 * 将图片转为单张 base64 Data URL
 * 对文本密集场景保留更多细节
 */
export async function imageToBase64WithOptions(
  imagePath: string,
  options?: { preferText?: boolean }
): Promise<string> {
  try {
    const normalizedPath = normalizeImageSourcePath(imagePath);
    const result = await encodeImageSource(normalizedPath, options);
    return `data:${result.mimeType};base64,${result.base64}`;
  } catch (error) {
    throw new Error(
      `Failed to process image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * 生成原图和多裁剪变体，并回流最终 preferText 决策。
 * 用于大图、长图和文本密集截图场景。
 */
async function processImageVariants(
  imagePath: string,
  options?: { preferText?: boolean; maxTiles?: number }
): Promise<{ variants: string[]; preferTextUsed: boolean }> {
  try {
    const normalizedPath = normalizeImageSourcePath(imagePath);
    const { buffer: imageBuffer, mimeType } = await loadImageBuffer(normalizedPath);

    return processBufferVariants(imageBuffer, mimeType, options);
  } catch (error) {
    throw new Error(
      `Failed to process image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function processBufferVariants(
  imageBuffer: Buffer,
  mimeType: string,
  options?: { preferText?: boolean; maxTiles?: number }
): Promise<{ variants: string[]; preferTextUsed: boolean }> {
  await checkImageResolution(imageBuffer);
  if (mimeType === "image/gif") {
    const full = await encodeBufferToDataUrl(imageBuffer, mimeType, options?.preferText);
    return { variants: [full], preferTextUsed: options?.preferText ?? false };
  }
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const preferText = await resolvePreferTextMode(imageBuffer, mimeType, options?.preferText);
  const full = await encodeBufferToDataUrl(imageBuffer, mimeType, preferText);
  if (!width || !height) return { variants: [full], preferTextUsed: preferText };
  const shouldSplit = Math.max(width, height) >= CROP_MIN_DIMENSION || width * height >= CROP_MIN_PIXEL_COUNT;
  if (!shouldSplit) return { variants: [full], preferTextUsed: preferText };
  const regions = buildCropRegions(width, height, Math.max(1, options?.maxTiles ?? 5));
  const tiles = await Promise.all(regions.map(async region => {
    const tileBuffer = await sharp(imageBuffer).extract(region).toBuffer();
    return encodeBufferToDataUrl(tileBuffer, mimeType, preferText);
  }));
  return { variants: [full, ...tiles], preferTextUsed: preferText };
}

export async function encodeLoadedOverview(
  imageBuffer: Buffer,
  mimeType: string,
  preferText?: boolean
): Promise<string> {
  return encodeBufferToDataUrl(imageBuffer, mimeType, preferText);
}

export async function cropLoadedImage(
  imageBuffer: Buffer,
  region: { left: number; top: number; width: number; height: number }
): Promise<string> {
  const output = await sharp(imageBuffer).extract(region).png().toBuffer();
  return encodeBufferToDataUrl(output, "image/png", true);
}

/**
 * 生成原图和多裁剪变体
 * 用于大图、长图和文本密集截图场景
 */
export async function imageToBase64Variants(
  imagePath: string,
  options?: { preferText?: boolean; maxTiles?: number }
): Promise<string[]> {
  return (await processImageVariants(imagePath, options)).variants;
}

/**
 * 准备适合模型理解的图片输入。
 * 多裁剪场景除了返回图片列表，还会补充阅读顺序提示，帮助模型理解每张图的角色。
 */
export async function prepareVisionImageInput(
  imagePath: string,
  options?: { preferText?: boolean; maxTiles?: number }
): Promise<PreparedImageInput> {
  const normalizedPath = normalizeImageSourcePath(imagePath);
  const cacheKey = makeCacheKey(normalizedPath, options);

  const cached = imageCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const { variants, preferTextUsed } = await processImageVariants(imagePath, options);

  let result: PreparedImageInput;
  if (variants.length <= 1) {
    result = { imageData: variants[0], preferTextUsed };
  } else {
    const metadataHint = buildImageSetHint(variants.length - 1, imagePath, options);
    result = {
      imageData: variants,
      imageHint: metadataHint,
      preferTextUsed,
    };
  }

  // 只在成功时缓存
  imageCache.set(cacheKey, result);
  return result;
}

/**
 * 检查图片像素尺寸是否超过限制
 * 防止超大图片导致 sharp OOM
 */
async function checkImageResolution(buffer: Buffer): Promise<void> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width * height > MAX_PIXEL_COUNT) {
    const maxWidth = Math.round(Math.sqrt(MAX_PIXEL_COUNT));
    const maxHeight = maxWidth;
    throw new Error(
      `Image dimensions exceed the maximum allowed resolution of ${maxWidth}x${maxHeight} (or ${MAX_PIXEL_COUNT} total pixels)`
    );
  }
}

/**
 * 统一处理图片来源并编码为 base64
 */
async function encodeImageSource(
  normalizedPath: string,
  options?: { preferText?: boolean }
): Promise<{ base64: string; mimeType: string }> {
  const { buffer, mimeType } = await loadImageBuffer(normalizedPath);
  await checkImageResolution(buffer);
  return encodeLocalImage(buffer, mimeType, options);
}

/**
 * 编码单张图片，必要时先压缩
 */
async function encodeLocalImage(
  imageBuffer: Buffer,
  mimeType: string,
  options?: { preferText?: boolean }
): Promise<{ base64: string; mimeType: string }> {
  let buffer = imageBuffer;
  let outputMimeType = mimeType;
  const preferText = await resolvePreferTextMode(
    imageBuffer,
    mimeType,
    options?.preferText
  );

  if (buffer.length > COMPRESS_THRESHOLD_BYTES) {
    logger.info("Compressing large image", {
      originalSize: `${(buffer.length / (1024 * 1024)).toFixed(2)}MB`,
      preferText,
    });
    const compressed = await compressImage(buffer, outputMimeType, preferText);
    buffer = compressed.buffer;
    outputMimeType = compressed.mimeType;
  }

  return {
    base64: buffer.toString("base64"),
    mimeType: outputMimeType,
  };
}

/**
 * 将图片 Buffer 编码为 Data URL
 */
async function encodeBufferToDataUrl(
  imageBuffer: Buffer,
  inputMimeType: string,
  preferText?: boolean
): Promise<string> {
  let buffer = imageBuffer;
  let mimeType = inputMimeType;

  if (buffer.length > COMPRESS_THRESHOLD_BYTES) {
    const compressed = await compressImage(buffer, mimeType, preferText);
    buffer = compressed.buffer;
    mimeType = compressed.mimeType;
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * 压缩图片
 */
async function compressImage(
  imageBuffer: Buffer,
  inputMimeType: string,
  preferText?: boolean
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (inputMimeType === "image/gif") {
    return { buffer: imageBuffer, mimeType: inputMimeType };
  }

  const maxSize = preferText ? COMPRESS_MAX_DIMENSION_TEXT : COMPRESS_MAX_DIMENSION_GENERAL;
  const pipeline = sharp(imageBuffer).resize(maxSize, maxSize, {
    fit: "inside",
    withoutEnlargement: true,
  });

  if (inputMimeType === "image/png") {
    const buffer = await pipeline
      .png({ compressionLevel: preferText ? COMPRESS_PNG_LEVEL_TEXT : COMPRESS_PNG_LEVEL_GENERAL })
      .toBuffer();
    return { buffer, mimeType: "image/png" };
  }

  if (inputMimeType === "image/webp") {
    const buffer = await pipeline
      .webp({ quality: preferText ? COMPRESS_QUALITY_TEXT : COMPRESS_QUALITY_GENERAL })
      .toBuffer();
    return { buffer, mimeType: "image/webp" };
  }

  const buffer = await pipeline
    .jpeg({ quality: preferText ? COMPRESS_QUALITY_TEXT : COMPRESS_QUALITY_GENERAL })
    .toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}

/**
 * 解析最终是否启用文本优先处理。
 * - 显式传入 true / false 时尊重调用方
 * - 未显式指定时，根据图片尺寸、长宽比和格式自动判断
 */
async function resolvePreferTextMode(
  imageBuffer: Buffer,
  mimeType: string,
  preferText?: boolean
): Promise<boolean> {
  if (preferText !== undefined) {
    return preferText;
  }

  return inferTextHeavyFromImage(imageBuffer, mimeType);
}

/**
 * 根据图片自身特征推断是否更适合文本优先处理。
 * 这里保持保守，只在典型长图、截图和高分辨率文档图上自动启用。
 */
async function inferTextHeavyFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<boolean> {
  if (mimeType === "image/gif") {
    return false;
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      return mimeType === "image/png";
    }

    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    const aspectRatio = shortSide > 0 ? longSide / shortSide : 1;
    const pixelCount = width * height;
    const screenshotLikeMime =
      mimeType === "image/png" || mimeType === "image/webp";

    if (aspectRatio >= 2.2 && longSide >= 1400) {
      return true;
    }

    if (screenshotLikeMime && pixelCount >= 1_200_000 && shortSide >= 700) {
      return true;
    }

    if (pixelCount >= 2_800_000 && shortSide >= 900) {
      return true;
    }

    return false;
  } catch {
    return mimeType === "image/png";
  }
}

type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * 为长图、宽图和接近正方形的大图生成自适应裁剪区域。
 * - 长图优先按纵向条带切分
 * - 宽图优先按横向条带切分
 * - 近似正方形的大图使用 2x2 网格
 * - 裁剪之间保留少量重叠，减少文字落在边界处被截断
 */
function buildCropRegions(
  width: number,
  height: number,
  maxTiles: number
): CropRegion[] {
  const extraTiles = Math.max(0, maxTiles - 1);
  if (extraTiles === 0) {
    return [];
  }

  const aspectRatio = width / height;
  let rows = 1;
  let cols = 1;

  if (height / width >= 1.6) {
    rows = Math.min(extraTiles, Math.max(2, Math.min(4, Math.ceil(height / width))));
  } else if (width / height >= 1.6) {
    cols = Math.min(extraTiles, Math.max(2, Math.min(4, Math.ceil(width / height))));
  } else {
    if (extraTiles >= 4) {
      rows = 2;
      cols = 2;
    } else if (extraTiles === 3) {
      if (aspectRatio >= 1) {
        cols = 3;
      } else {
        rows = 3;
      }
    } else if (extraTiles === 2) {
      if (aspectRatio >= 1) {
        cols = 2;
      } else {
        rows = 2;
      }
    }
  }

  const overlapX = cols > 1 ? Math.min(96, Math.floor(width * 0.06)) : 0;
  const overlapY = rows > 1 ? Math.min(96, Math.floor(height * 0.06)) : 0;
  const baseWidth =
    cols > 1 ? Math.ceil((width + overlapX * (cols - 1)) / cols) : width;
  const baseHeight =
    rows > 1 ? Math.ceil((height + overlapY * (rows - 1)) / rows) : height;
  const stepX = cols > 1 ? baseWidth - overlapX : width;
  const stepY = rows > 1 ? baseHeight - overlapY : height;
  const regions: CropRegion[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (regions.length >= extraTiles) {
        return regions;
      }

      const left =
        cols > 1 ? Math.min(col * stepX, Math.max(0, width - baseWidth)) : 0;
      const top =
        rows > 1 ? Math.min(row * stepY, Math.max(0, height - baseHeight)) : 0;

      regions.push({
        left,
        top,
        width: Math.min(baseWidth, width - left),
        height: Math.min(baseHeight, height - top),
      });
    }
  }

  return regions;
}

/**
 * 为多图输入生成阅读顺序提示。
 * 这里不暴露本地路径，只说明第 1 张为总览，其余图片按阅读方向排列。
 */
function buildImageSetHint(
  tileCount: number,
  imagePath: string,
  options?: { preferText?: boolean; maxTiles?: number }
): string {
  const normalizedPath = normalizeImageSourcePath(imagePath);
  const isData = isDataUri(normalizedPath);
  const sourceKind = isData
    ? "pasted image"
    : isUrl(normalizedPath)
      ? "remote image"
      : "local image";

  const labels = Array.from({ length: tileCount }, (_, index) => {
    const position = index + 2;
    return `image ${position} is a zoomed crop in reading order`;
  });

  const detailHint = options?.preferText
    ? "These crops preserve small text and dense details."
    : "These crops provide localized detail views.";

  return [
    `Image set note: image 1 is the full overview of the ${sourceKind}.`,
    `Images 2-${tileCount + 1} are ordered detail crops generated from the same image.`,
    "Read them as a sequence of supporting close-ups after understanding the overview.",
    detailHint,
    `Per-image role: ${labels.join("; ")}.`,
  ].join(" ");
}
