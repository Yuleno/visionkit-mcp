import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildSampleTimestamps, selectSmartFrames, VideoFrameExtractor, type ProcessRunner } from "../../src/media/video-frames.js";

const dir = path.resolve(".visionkit-mcp/unit-video");
const video = path.join(dir, "sample.mp4");

beforeEach(async () => { await mkdir(dir, { recursive: true }); await writeFile(video, "fake-video"); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("video frame extraction", () => {
  it("生成等分区间中点时间戳", () => {
    expect(buildSampleTimestamps(10, 4)).toEqual([1.25, 3.75, 6.25, 8.75]);
  });

  it("拒绝 URL 和超时长视频", async () => {
    const extractor = new VideoFrameExtractor(async () => ({ stdout: '{"format":{"duration":"121"}}', stderr: "" }));
    await expect(extractor.extract("https://example.com/a.mp4", baseOptions())).rejects.toThrow(/仅支持本地/);
    await expect(extractor.extract(video, baseOptions())).rejects.toThrow(/120 秒/);
  });

  it("使用无 shell 固定参数抽帧并去除重复画面", async () => {
    const jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).jpeg().toBuffer();
    const runner: ProcessRunner = vi.fn(async (command, args) => {
      if (command === "probe-test") return { stdout: '{"format":{"duration":"12"}}', stderr: "" };
      if (String(args[args.length - 1]).includes("%03d")) return { stdout: "", stderr: "" };
      await writeFile(args[args.length - 1], jpg);
      return { stdout: "", stderr: "" };
    });
    const result = await new VideoFrameExtractor(runner).extract(video, {
      ...baseOptions(), maxFrames: 3, ffprobePath: "probe-test", ffmpegPath: "ffmpeg-test",
    });
    expect(result.timestamps).toEqual([2]);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(runner).toHaveBeenCalledTimes(5);
    expect((runner as any).mock.calls[1][1]).toContain("-nostdin");
  });

  it("去重相同帧但保留不同纯色，并按场景优先补足预算", async () => {
    const red = await color("red");
    const green = await color("green");
    const blue = await color("blue");
    const selected = await selectSmartFrames([
      { buffer: red, timestamp: 1, kind: "uniform" },
      { buffer: red, timestamp: 2, kind: "uniform" },
      { buffer: green, timestamp: 3, kind: "scene" },
      { buffer: blue, timestamp: 4, kind: "scene" },
    ], 3);
    expect(selected.frames.map(frame => frame.timestamp)).toEqual([1, 3, 4]);
    expect(selected.duplicatesRemoved).toBe(1);
  });

  it("读取场景候选时间戳并与均匀帧混合", async () => {
    const red = await color("red");
    const green = await color("green");
    const runner: ProcessRunner = vi.fn(async (command, args) => {
      if (command === "probe-test") return { stdout: '{"format":{"duration":"10"}}', stderr: "" };
      const output = String(args[args.length - 1]);
      if (output.includes("scene-%03d")) {
        await writeFile(output.replace("%03d", "001"), green);
        return { stdout: "", stderr: "pts_time:4.200" };
      }
      await writeFile(output, red);
      return { stdout: "", stderr: "" };
    });
    const result = await new VideoFrameExtractor(runner).extract(video, {
      ...baseOptions(), maxFrames: 3, ffprobePath: "probe-test", ffmpegPath: "ffmpeg-test",
    });
    expect(result.timestamps).toEqual([1.6666666666666667, 4.2, 5]);
    expect(result.frames).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("智能采样候选 4 帧");
  });

  it("场景检测失败时保留均匀抽帧并产生warning", async () => {
    const red = await color("red");
    const runner: ProcessRunner = vi.fn(async (command, args) => {
      if (command === "probe-test") return { stdout: '{"format":{"duration":"9"}}', stderr: "" };
      if (args.some((arg: string) => String(arg).includes("select=gt(scene"))) throw new Error("scene unavailable");
      await writeFile(args[args.length - 1], red);
      return { stdout: "", stderr: "" };
    });
    const result = await new VideoFrameExtractor(runner).extract(video, {
      ...baseOptions(), maxFrames: 3, ffprobePath: "probe-test", ffmpegPath: "ffmpeg-test",
    });
    expect(result.frames).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("场景检测失败");
    const sceneArgs = (runner as any).mock.calls.at(-1)[1];
    expect(sceneArgs).toContain("6");
  });
});

function baseOptions() {
  return { maxSizeMB: 100, maxDurationSeconds: 120, maxFrames: 5 };
}

async function color(background: string) {
  return sharp({ create: { width: 16, height: 16, channels: 3, background } }).jpeg().toBuffer();
}
