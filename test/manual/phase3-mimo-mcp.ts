/**
 * 期3真实 MCP 回归：仅在已配置 custom/mimo-v2.5 且明确允许消耗 API 时运行。
 * 用法：npm run test:phase3-mimo
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const image = path.resolve("test/fixtures/tiny.png");
const expectedTools = [
  "image_analysis",
  "extract_text_from_screenshot",
  "diagnose_error_screenshot",
  "understand_technical_diagram",
  "analyze_data_visualization",
  "ui_to_artifact",
  "ui_diff_check",
];

const calls: Array<{ name: string; arguments: Record<string, string> }> = [
  { name: "image_analysis", arguments: { image_source: image, prompt: "简要描述图片内容" } },
  { name: "extract_text_from_screenshot", arguments: { image_source: image, prompt: "提取可见文字" } },
  { name: "diagnose_error_screenshot", arguments: { image_source: image, prompt: "若有报错，请说明根因" } },
  { name: "understand_technical_diagram", arguments: { image_source: image, prompt: "说明图中的结构" } },
  { name: "analyze_data_visualization", arguments: { image_source: image, prompt: "说明图表中的数据" } },
  { name: "ui_to_artifact", arguments: { image_source: image, prompt: "生成简要 UI 规范", output_type: "spec" } },
  { name: "ui_diff_check", arguments: { expected_image_source: image, actual_image_source: image, prompt: "检查是否存在差异" } },
];

async function main() {
  const client = new Client({ name: "visionkit-phase3-mimo-smoke", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["build/index.js"], cwd: process.cwd() });
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
      const structured = result.structuredContent as { text?: unknown; warnings?: unknown } | undefined;
      if (!structured || typeof structured.text !== "string" || !Array.isArray(structured.warnings)) {
        throw new Error(`${call.name} 未返回预期 structuredContent`);
      }
      process.stdout.write(`PASS ${call.name}\n`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`期3 mimo MCP 回归失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
