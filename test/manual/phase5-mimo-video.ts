/** 期5真实验收：本地 FFmpeg 抽帧后调用 mimo-v2.5。会发送抽取帧并产生 API 消耗。 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const video = path.resolve(process.argv[2] || ".visionkit-mcp/phase5-video-smoke.mp4");
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);
const client = new Client({ name: "visionkit-phase5-video-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["build/index.js"],
  cwd: process.cwd(),
  env: baseEnv,
});
await client.connect(transport);
try {
  const tools = await client.listTools();
  if (!tools.tools.some(tool => tool.name === "video_analysis")) throw new Error("tools/list 缺少 video_analysis");
  const result = await client.callTool({
    name: "video_analysis",
    arguments: { video_source: video, prompt: "按时间顺序说明画面颜色如何变化，只依据可见帧作答" },
  });
  if (result.isError) throw new Error(`video_analysis 返回错误: ${JSON.stringify(result.content)}`);
  process.stdout.write(JSON.stringify(result.structuredContent, null, 2));
} finally {
  await client.close();
}
