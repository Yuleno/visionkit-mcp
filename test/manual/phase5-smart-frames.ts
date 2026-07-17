/** 期5.1真实验收：短暂黄色事件不会被均匀采样命中，但应被场景关键帧捕获。 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { VERSION } from "../../src/version.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildSampleTimestamps, defaultProcessRunner, VideoFrameExtractor } from "../../src/media/video-frames.js";

const output = path.resolve(".visionkit-mcp/phase5-smart-event.mp4");
await mkdir(path.dirname(output), { recursive: true });
const ffmpegPath = process.env.VISIONKIT_FFMPEG_PATH || "ffmpeg";
const ffprobePath = process.env.VISIONKIT_FFPROBE_PATH || "ffprobe";
await defaultProcessRunner(ffmpegPath, [
  "-nostdin", "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", "color=c=red:s=640x360:d=2",
  "-f", "lavfi", "-i", "color=c=yellow:s=640x360:d=0.25",
  "-f", "lavfi", "-i", "color=c=red:s=640x360:d=6",
  "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]",
  "-map", "[out]", "-r", "20", "-y", output,
], 30_000);

const extracted = await new VideoFrameExtractor().extract(output, {
  maxSizeMB: 100, maxDurationSeconds: 120, maxFrames: 5, ffmpegPath, ffprobePath,
});
const uniform = buildSampleTimestamps(extracted.durationSeconds, 5);
if (uniform.some(time => time >= 2 && time <= 2.25)) throw new Error("测试视频的均匀采样意外命中短事件");
if (!extracted.timestamps.some(time => time >= 1.9 && time <= 2.35)) {
  throw new Error(`智能采样未捕获短事件: ${extracted.timestamps.join(", ")}`);
}

const env = Object.fromEntries(Object.entries(process.env).filter(
  (entry): entry is [string, string] => typeof entry[1] === "string"
));
const client = new Client({ name: "visionkit-phase5-smart-frame-smoke", version: VERSION });
const transport = new StdioClientTransport({ command: process.execPath, args: ["build/index.js"], cwd: process.cwd(), env });
await client.connect(transport);
try {
  const result = await client.callTool({
    name: "video_analysis",
    arguments: { video_source: output, prompt: "按时间顺序描述颜色变化，特别指出是否出现过短暂的不同颜色" },
  });
  if (result.isError) throw new Error(`video_analysis失败: ${JSON.stringify(result.content)}`);
  const structured = result.structuredContent as { text?: string; warnings?: string[] };
  if (!structured.text || !/(黄|yellow)/i.test(structured.text)) throw new Error(`模型未识别黄色短事件: ${structured.text}`);
  process.stdout.write(JSON.stringify({ uniform, smart: extracted.timestamps, result: structured }, null, 2));
} finally {
  await client.close();
}
