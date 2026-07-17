import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateImageSource } from "../../src/media/image-source.js";
import {
  imageToBase64,
  imageToBase64Variants,
  imageToBase64WithOptions,
  prepareVisionImageInput,
} from "../../src/media/prepare-image.js";

function payload(dataUrl: string): Buffer {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Data URL missing payload");
  return Buffer.from(encoded, "base64");
}

async function createPngDataUrl(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function dimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(payload(dataUrl)).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image metadata missing dimensions");
  return { width: metadata.width, height: metadata.height };
}

describe("图片处理管线回归", () => {
  it("Data URI 经过统一管线并拒绝不支持的 MIME", async () => {
    const valid = await createPngDataUrl(1, 1);
    await expect(validateImageSource(valid)).resolves.toBeUndefined();
    await expect(imageToBase64(valid)).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(
      validateImageSource("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
    ).rejects.toThrow(/Unsupported image format/);
  });

  it.each([
    [1200, 3600, "portrait"],
    [3600, 1200, "landscape"],
  ] as const)("%s×%s %s 大图生成总览和三个裁剪", async (...testCase) => {
    const [width, height] = testCase;
    const variants = await imageToBase64Variants(await createPngDataUrl(width, height), {
      preferText: true,
      maxTiles: 4,
    });
    expect(variants).toHaveLength(4);
    expect(await dimensions(variants[0])).toEqual({ width, height });
    for (const tile of variants.slice(1)) {
      const size = await dimensions(tile);
      if (height > width) {
        expect(size.width).toBe(width);
        expect(size.height).toBeLessThan(height);
      } else {
        expect(size.height).toBe(height);
        expect(size.width).toBeLessThan(width);
      }
    }
  });

  it("多裁剪结果包含阅读顺序提示", async () => {
    const prepared = await prepareVisionImageInput(await createPngDataUrl(1200, 3600), {
      preferText: true,
      maxTiles: 4,
    });
    expect(prepared.imageData).toBeInstanceOf(Array);
    expect(prepared.imageHint).toMatch(/image 1 is the full overview/i);
    expect(prepared.preferTextUsed).toBe(true);
  });

  it("超大 Data URI 在解码前被大小预算拒绝", async () => {
    const oversized = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`;
    await expect(validateImageSource(oversized, 1)).rejects.toThrow(/too large/);
  });

  it("显式文本策略在单图编码时被保留", async () => {
    const image = await createPngDataUrl(800, 800);
    await expect(imageToBase64WithOptions(image, { preferText: true })).resolves.toMatch(
      /^data:image\/png;base64,/
    );
  });
});
