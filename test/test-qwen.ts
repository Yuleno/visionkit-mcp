/**
 * Qwen 客户端测试
 * 测试阿里云通义千问VL视觉理解
 *
 * 注：client 构造复用 src/client-registry.ts 的 createClient，
 * 图片预处理直接调 src/image-processor.ts 导出的共享函数，
 * 不再持有 prepareImageInput 副本。
 */

import { loadConfig } from "../src/config.js";
import { createClient } from "../src/client-registry.js";
import {
  imageToBase64Variants,
  imageToBase64WithOptions,
} from "../src/image-processor.js";
import { TEXT_HEAVY_PROMPT_PATTERN } from "../src/constants.js";

async function testQwen() {
  // 获取图片路径
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Error: please provide an image path");
    console.log("Usage: tsx test/test-qwen.ts <image-path>");
    process.exit(1);
  }

  const config = loadConfig();
  config.provider = "qwen";
  if (!config.apiKey) {
    config.apiKey = process.env.DASHSCOPE_API_KEY || "";
  }
  if (!config.model) {
    config.model = "qwen3-vl-flash";
  }

  if (!config.apiKey) {
    console.error("Error: DASHSCOPE_API_KEY is required");
    process.exit(1);
  }

  // 复用 src/client-registry 的 createClient(已按 provider=qwen 选 QwenClient)
  const client = createClient(config);
  console.log(`Testing ${client.getModelName()}\n`);

  const prompts = [
    "请详细分析这张图片的内容",
    "请详细分析这张图片的内容，包括所有细节",
    "识别图片中的所有文字",
  ];

  for (const prompt of prompts) {
    console.log(`Prompt: ${prompt}`);
    // 直接复用 src/image-processor 导出的共享函数
    const preferText = TEXT_HEAVY_PROMPT_PATTERN.test(prompt);
    let imageInput: string | string[];
    if (config.multiCrop) {
      const variants = await imageToBase64Variants(imagePath, {
        preferText,
        maxTiles: config.multiCropMaxTiles,
      });
      imageInput = variants.length === 1 ? variants[0] : variants;
    } else {
      imageInput = await imageToBase64WithOptions(imagePath, { preferText });
    }
    const result = await client.analyzeImage(
      imageInput,
      prompt,
      config.enableThinking
    );
    console.log(result);
    console.log("\n----------------------------------------\n");
  }
}

void testQwen().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
