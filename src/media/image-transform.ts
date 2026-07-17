import sharp from "sharp";
import { logger } from "../utils/logger.js";

const MAX_PIXEL_COUNT = 16_000_000;
const COMPRESS_MAX_DIMENSION_TEXT = 3072;
const COMPRESS_MAX_DIMENSION_GENERAL = 2048;
const COMPRESS_QUALITY_TEXT = 90;
const COMPRESS_QUALITY_GENERAL = 85;
const COMPRESS_PNG_LEVEL_TEXT = 3;
const COMPRESS_PNG_LEVEL_GENERAL = 6;
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;

export async function assertImageResolution(buffer: Buffer): Promise<void> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width * height > MAX_PIXEL_COUNT) {
    const side = Math.round(Math.sqrt(MAX_PIXEL_COUNT));
    throw new Error(
      `Image dimensions exceed the maximum allowed resolution of ${side}x${side} (or ${MAX_PIXEL_COUNT} total pixels)`
    );
  }
}

export async function resolvePreferTextMode(
  imageBuffer: Buffer,
  mimeType: string,
  preferText?: boolean
): Promise<boolean> {
  if (preferText !== undefined) return preferText;
  if (mimeType === "image/gif") return false;

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) return mimeType === "image/png";

    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    const aspectRatio = shortSide > 0 ? longSide / shortSide : 1;
    const pixelCount = width * height;
    const screenshotLike = mimeType === "image/png" || mimeType === "image/webp";

    return (
      (aspectRatio >= 2.2 && longSide >= 1400) ||
      (screenshotLike && pixelCount >= 1_200_000 && shortSide >= 700) ||
      (pixelCount >= 2_800_000 && shortSide >= 900)
    );
  } catch {
    return mimeType === "image/png";
  }
}

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
    return {
      buffer: await pipeline.png({
        compressionLevel: preferText ? COMPRESS_PNG_LEVEL_TEXT : COMPRESS_PNG_LEVEL_GENERAL,
      }).toBuffer(),
      mimeType: "image/png",
    };
  }
  if (inputMimeType === "image/webp") {
    return {
      buffer: await pipeline.webp({
        quality: preferText ? COMPRESS_QUALITY_TEXT : COMPRESS_QUALITY_GENERAL,
      }).toBuffer(),
      mimeType: "image/webp",
    };
  }
  return {
    buffer: await pipeline.jpeg({
      quality: preferText ? COMPRESS_QUALITY_TEXT : COMPRESS_QUALITY_GENERAL,
    }).toBuffer(),
    mimeType: "image/jpeg",
  };
}

export async function encodeImageBuffer(
  imageBuffer: Buffer,
  mimeType: string,
  preferText?: boolean
): Promise<{ base64: string; mimeType: string; preferTextUsed: boolean }> {
  const preferTextUsed = await resolvePreferTextMode(imageBuffer, mimeType, preferText);
  let buffer = imageBuffer;
  let outputMimeType = mimeType;
  if (buffer.length > COMPRESS_THRESHOLD_BYTES) {
    logger.info("Compressing large image", {
      originalSize: `${(buffer.length / (1024 * 1024)).toFixed(2)}MB`,
      preferText: preferTextUsed,
    });
    const compressed = await compressImage(buffer, outputMimeType, preferTextUsed);
    buffer = compressed.buffer;
    outputMimeType = compressed.mimeType;
  }
  return { base64: buffer.toString("base64"), mimeType: outputMimeType, preferTextUsed };
}

export async function encodeBufferToDataUrl(
  imageBuffer: Buffer,
  mimeType: string,
  preferText?: boolean
): Promise<string> {
  const encoded = await encodeImageBuffer(imageBuffer, mimeType, preferText);
  return `data:${encoded.mimeType};base64,${encoded.base64}`;
}
