import sharp from "sharp";
import {
  assertImageResolution,
  encodeBufferToDataUrl,
  resolvePreferTextMode,
} from "./image-transform.js";

const CROP_MIN_DIMENSION = 1800;
const CROP_MIN_PIXEL_COUNT = 3_500_000;

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageVariantOptions {
  preferText?: boolean;
  maxTiles?: number;
}

export async function processBufferVariants(
  imageBuffer: Buffer,
  mimeType: string,
  options?: ImageVariantOptions
): Promise<{ variants: string[]; preferTextUsed: boolean }> {
  await assertImageResolution(imageBuffer);
  if (mimeType === "image/gif") {
    const full = await encodeBufferToDataUrl(imageBuffer, mimeType, options?.preferText);
    return { variants: [full], preferTextUsed: options?.preferText ?? false };
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const preferTextUsed = await resolvePreferTextMode(imageBuffer, mimeType, options?.preferText);
  const full = await encodeBufferToDataUrl(imageBuffer, mimeType, preferTextUsed);
  if (!width || !height) return { variants: [full], preferTextUsed };

  const shouldSplit =
    Math.max(width, height) >= CROP_MIN_DIMENSION || width * height >= CROP_MIN_PIXEL_COUNT;
  if (!shouldSplit) return { variants: [full], preferTextUsed };

  const regions = buildCropRegions(width, height, Math.max(1, options?.maxTiles ?? 5));
  const tiles = await Promise.all(regions.map(async (region) => {
    const tileBuffer = await sharp(imageBuffer).extract(region).toBuffer();
    return encodeBufferToDataUrl(tileBuffer, mimeType, preferTextUsed);
  }));
  return { variants: [full, ...tiles], preferTextUsed };
}

export async function cropLoadedImage(imageBuffer: Buffer, region: CropRegion): Promise<string> {
  const output = await sharp(imageBuffer).extract(region).png().toBuffer();
  return encodeBufferToDataUrl(output, "image/png", true);
}

export function buildCropRegions(width: number, height: number, maxTiles: number): CropRegion[] {
  const extraTiles = Math.max(0, maxTiles - 1);
  if (extraTiles === 0) return [];

  const aspectRatio = width / height;
  let rows = 1;
  let cols = 1;
  if (height / width >= 1.6) {
    rows = Math.min(extraTiles, Math.max(2, Math.min(4, Math.ceil(height / width))));
  } else if (width / height >= 1.6) {
    cols = Math.min(extraTiles, Math.max(2, Math.min(4, Math.ceil(width / height))));
  } else if (extraTiles >= 4) {
    rows = 2;
    cols = 2;
  } else if (extraTiles === 3) {
    if (aspectRatio >= 1) cols = 3;
    else rows = 3;
  } else if (extraTiles === 2) {
    if (aspectRatio >= 1) cols = 2;
    else rows = 2;
  }

  const overlapX = cols > 1 ? Math.min(96, Math.floor(width * 0.06)) : 0;
  const overlapY = rows > 1 ? Math.min(96, Math.floor(height * 0.06)) : 0;
  const baseWidth = cols > 1 ? Math.ceil((width + overlapX * (cols - 1)) / cols) : width;
  const baseHeight = rows > 1 ? Math.ceil((height + overlapY * (rows - 1)) / rows) : height;
  const stepX = cols > 1 ? baseWidth - overlapX : width;
  const stepY = rows > 1 ? baseHeight - overlapY : height;
  const regions: CropRegion[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (regions.length >= extraTiles) return regions;
      const left = cols > 1 ? Math.min(col * stepX, Math.max(0, width - baseWidth)) : 0;
      const top = rows > 1 ? Math.min(row * stepY, Math.max(0, height - baseHeight)) : 0;
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
