/** 期4真实对照：同一密集截图分别关闭/开启 Agentic Zoom。会产生 API 消耗。 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const image = path.resolve(process.argv[2] || "imageTest/deepswe.png");
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

async function run(enabled: boolean) {
  const client = new Client({ name: `visionkit-phase4-${enabled ? "on" : "off"}`, version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env: { ...baseEnv, VISIONKIT_ENABLE_AGENTIC_ZOOM: String(enabled), VISIONKIT_MAX_ZOOM_ROUNDS: "1" },
  });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: "extract_text_from_screenshot",
      arguments: { image_source: image, prompt: "请尽可能完整、准确地提取图片中所有可见文字，保留阅读顺序和表格结构" },
    });
    if (result.isError) throw new Error(`MCP 返回错误: ${JSON.stringify(result.content)}`);
    const data = result.structuredContent as { text: string; rounds: number; warnings: string[] };
    if (!data || typeof data.text !== "string") throw new Error("缺少 structuredContent");
    return data;
  } finally {
    await client.close();
  }
}

const baseline = await run(false);
const zoom = await run(true);
process.stdout.write(JSON.stringify({
  image,
  baseline: { rounds: baseline.rounds, warnings: baseline.warnings, text: baseline.text },
  zoom: { rounds: zoom.rounds, warnings: zoom.warnings, text: zoom.text },
}, null, 2));
