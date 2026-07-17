/** 使用生产管线直接执行一次图片分析，不经过 MCP 客户端。 */
import { TEXT_HEAVY_PROMPT_PATTERN } from "../../src/constants.js";
import { loadConfig } from "../../src/config.js";
import { validateImageSource } from "../../src/media/image-source.js";
import {
  imageToBase64WithOptions,
  prepareVisionImageInput,
} from "../../src/media/prepare-image.js";
import { createClient } from "../../src/providers/registry.js";

async function testImageAnalysis(imagePath: string, question?: string): Promise<void> {
  const config = loadConfig();
  await validateImageSource(imagePath);
  const prompt = question || "请详细分析这张图片的内容";
  const preferText = TEXT_HEAVY_PROMPT_PATTERN.test(prompt);

  let images: string[];
  let imageHint: string | undefined;
  if (config.multiCrop) {
    const prepared = await prepareVisionImageInput(imagePath, {
      preferText,
      maxTiles: config.multiCropMaxTiles,
    });
    images = Array.isArray(prepared.imageData) ? prepared.imageData : [prepared.imageData];
    imageHint = prepared.imageHint;
  } else {
    images = [await imageToBase64WithOptions(imagePath, { preferText })];
  }

  const client = createClient(config);
  process.stdout.write(`Calling ${client.getModelName()} with ${images.length} image(s)...\n`);
  const result = await client.analyze({
    images,
    userPrompt: imageHint ? `${prompt}\n\n补充说明：${imageHint}` : prompt,
    thinking: config.enableThinking,
  });
  process.stdout.write(`${result.text}\n`);
  if (result.warnings?.length) {
    process.stderr.write(`Warnings: ${result.warnings.join("; ")}\n`);
  }
}

const args = process.argv.slice(2);
if (!args[0]) {
  process.stderr.write("Usage: npm run test:local <image-path-or-url> [question]\n");
  process.exit(1);
}

testImageAnalysis(args[0], args.slice(1).join(" ") || undefined).catch((error) => {
  process.stderr.write(`Local test failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
