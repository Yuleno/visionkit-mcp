import { isUrl } from "../utils/helpers.js";
import { LruCache, makeImageCacheKey } from "./image-cache.js";
import { processBufferVariants, type ImageVariantOptions } from "./image-crop.js";
import { isDataUri, loadImageBuffer, normalizeImageSourcePath } from "./image-source.js";
import { assertImageResolution, encodeImageBuffer } from "./image-transform.js";

export interface PreparedImageInput {
  imageData: string | string[];
  imageHint?: string;
  preferTextUsed: boolean;
}

const imageCache = new LruCache<string, PreparedImageInput>(100);

export async function imageToBase64(imagePath: string): Promise<string> {
  return imageToBase64WithOptions(imagePath);
}

export async function imageToBase64WithOptions(
  imagePath: string,
  options?: { preferText?: boolean }
): Promise<string> {
  try {
    const normalizedSource = normalizeImageSourcePath(imagePath);
    const { buffer, mimeType } = await loadImageBuffer(normalizedSource);
    await assertImageResolution(buffer);
    const encoded = await encodeImageBuffer(buffer, mimeType, options?.preferText);
    return `data:${encoded.mimeType};base64,${encoded.base64}`;
  } catch (error) {
    throw new Error(
      `Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

async function processImageVariants(
  imagePath: string,
  options?: ImageVariantOptions
): Promise<{ variants: string[]; preferTextUsed: boolean }> {
  try {
    const normalizedSource = normalizeImageSourcePath(imagePath);
    const { buffer, mimeType } = await loadImageBuffer(normalizedSource);
    return processBufferVariants(buffer, mimeType, options);
  } catch (error) {
    throw new Error(
      `Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function imageToBase64Variants(
  imagePath: string,
  options?: ImageVariantOptions
): Promise<string[]> {
  return (await processImageVariants(imagePath, options)).variants;
}

export async function prepareVisionImageInput(
  imagePath: string,
  options?: ImageVariantOptions
): Promise<PreparedImageInput> {
  const normalizedSource = normalizeImageSourcePath(imagePath);
  const cacheKey = makeImageCacheKey(normalizedSource, options, isDataUri(normalizedSource));
  const cached = imageCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { variants, preferTextUsed } = await processImageVariants(imagePath, options);
  const result: PreparedImageInput = variants.length <= 1
    ? { imageData: variants[0], preferTextUsed }
    : {
        imageData: variants,
        imageHint: buildImageSetHint(variants.length - 1, normalizedSource, options),
        preferTextUsed,
      };
  imageCache.set(cacheKey, result);
  return result;
}

function buildImageSetHint(
  tileCount: number,
  normalizedSource: string,
  options?: ImageVariantOptions
): string {
  const sourceKind = isDataUri(normalizedSource)
    ? "pasted image"
    : isUrl(normalizedSource)
      ? "remote image"
      : "local image";
  const labels = Array.from(
    { length: tileCount },
    (_, index) => `image ${index + 2} is a zoomed crop in reading order`
  );
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
