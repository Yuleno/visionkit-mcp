/**
 * VisionKit MCP 本地测试脚本
 * 直接测试图片分析功能，不需要MCP客户端
 *
 * 注：client 构造复用 src/client-registry.ts 的 createClient，
 * 图片预处理直接调 src/image-processor.ts 导出的共享函数，
 * 不再持有 createClient / prepareImageInput 副本。
 */

import { loadConfig } from "../src/config.js";
import { createClient } from "../src/client-registry.js";
import {
  imageToBase64WithOptions,
  prepareVisionImageInput,
  validateImageSource,
} from "../src/image-processor.js";
import { TEXT_HEAVY_PROMPT_PATTERN } from "../src/constants.js";

async function testImageAnalysis(imagePath: string, question?: string) {
  console.log("\n==========================================");
  console.log("Testing VisionKit MCP image analysis");
  console.log("==========================================\n");

  try {
    // 1. 加载配置
    console.log("Loading config...");
    const config = loadConfig();
    console.log(
      `Config loaded: provider=${config.provider}, model=${config.model}, multiCrop=${config.multiCrop}`
    );

    // 2. 验证图片
    console.log("Validating image source...");
    await validateImageSource(imagePath);
    console.log(`Image validation passed: ${imagePath}`);

    // 3. 构建提示词
    const prompt = question || "请详细分析这张图片的内容";
    console.log(`Prompt: ${prompt}`);

    // 4. 处理图片(直接复用 src/image-processor 导出的共享函数)
    console.log("Preparing image input...");
    const preferText = TEXT_HEAVY_PROMPT_PATTERN.test(prompt);
    let imageData: string | string[];
    let imageHint: string | undefined;
    if (config.multiCrop) {
      const prepared = await prepareVisionImageInput(imagePath, {
        preferText,
        maxTiles: config.multiCropMaxTiles,
      });
      imageData = prepared.imageData;
      imageHint = prepared.imageHint;
    } else {
      imageData = await imageToBase64WithOptions(imagePath, { preferText });
    }
    console.log(
      `Image prepared: ${
        Array.isArray(imageData) ? `${imageData.length} variants` : "single image"
      }`
    );
    if (imageHint) {
      console.log(`Image hint: ${imageHint}`);
    }

    // 5. 创建客户端并调用 API(复用 src/client-registry 的 createClient)
    const client = createClient(config);
    console.log(`Calling ${client.getModelName()}...`);
    const result = await client.analyzeImage(
      imageData,
      imageHint ? `${prompt}\n\n补充说明：${imageHint}` : prompt,
      config.enableThinking
    );

    // 6. 显示结果
    console.log("\n==========================================");
    console.log("Analysis Result");
    console.log("==========================================\n");
    console.log(result);
    console.log("\n==========================================");
    console.log("Local test completed");
    console.log("==========================================\n");
  } catch (error) {
    console.error("\nLocal test failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 解析命令行参数
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage:
  npm run test:local <image-path-or-url> [question]

Examples:
  npm run test:local ./test.png
  npm run test:local ./code-error.png "这段代码为什么报错？"
  npm run test:local https://example.com/image.jpg
`);
  process.exit(1);
}

const imagePath = args[0];
const question = args.slice(1).join(" ") || undefined;

void testImageAnalysis(imagePath, question);
