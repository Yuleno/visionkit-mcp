/**
 * Anthropic 协议真实 MCP 回归：用百炼 Anthropic 兼容端点（qwen3.6-plus）验证 7 个图片工具。
 * 仅在已配置可用 Anthropic 兼容端点且明确允许消耗 API 时运行。
 * 用法：npm run test:anthropic-mcp
 *
 * 默认读取本机环境变量（VISIONKIT_BASE_URL 指向 /apps/anthropic 等端点）。
 * 启动时用 sharp 动态生成有效合成图（≥10px，满足端点最小尺寸要求）。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import sharp from "sharp";
import { VERSION } from "../../src/version.js";

async function makeImage(): Promise<string> {
  const buf = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 220, g: 40, b: 40 } },
  }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}
const expectedTools = [
  "image_analysis",
  "extract_text_from_screenshot",
  "diagnose_error_screenshot",
  "understand_technical_diagram",
  "analyze_data_visualization",
  "ui_to_artifact",
  "ui_diff_check",
];

const buildCalls = (image: string): Array<{ name: string; arguments: Record<string, string> }> => [
  { name: "image_analysis", arguments: { image_source: image, prompt: "简要描述图片内容（颜色/主体）" } },
  { name: "extract_text_from_screenshot", arguments: { image_source: image, prompt: "提取可见文字，没有则说明" } },
  { name: "diagnose_error_screenshot", arguments: { image_source: image, prompt: "若有报错请说明根因，否则说明这是正常图" } },
  { name: "understand_technical_diagram", arguments: { image_source: image, prompt: "说明图中结构，若非技术图请说明" } },
  { name: "analyze_data_visualization", arguments: { image_source: image, prompt: "说明图表数据，若非图表请说明" } },
  { name: "ui_to_artifact", arguments: { image_source: image, prompt: "生成简要 UI 规范", output_type: "spec" } },
  { name: "ui_diff_check", arguments: { expected_image_source: image, actual_image_source: image, prompt: "检查两张相同图是否存在差异" } },
];

async function main() {
  const image = await makeImage();
  const calls = buildCalls(image);
  const client = new Client({ name: "visionkit-anthropic-smoke", version: VERSION });
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env,
  });
  await client.connect(transport);

  try {
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const name of expectedTools) {
      if (!names.has(name)) throw new Error(`MCP tools/list 缺少 ${name}`);
    }

    for (const call of calls) {
      const result = await client.callTool(call);
      if (result.isError) throw new Error(`${call.name} 返回 MCP 错误`);
      const structured = result.structuredContent as { text?: unknown; warnings?: unknown; model?: unknown } | undefined;
      if (!structured || typeof structured.text !== "string" || !Array.isArray(structured.warnings)) {
        throw new Error(`${call.name} 未返回预期 structuredContent`);
      }
      if (!structured.text.trim()) throw new Error(`${call.name} 返回空文本`);
      process.stdout.write(
        `PASS ${call.name} | model=${structured.model ?? "?"} | text=${structured.text.slice(0, 60).replace(/\n/g, " ")}…\n`
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`Anthropic MCP 回归失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
