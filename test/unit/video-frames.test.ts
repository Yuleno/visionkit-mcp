import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildSampleTimestamps, VideoFrameExtractor, type ProcessRunner } from "../../src/media/video-frames.js";

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

  it("使用无 shell 固定参数抽帧并按时间顺序返回", async () => {
    const jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).jpeg().toBuffer();
    const runner: ProcessRunner = vi.fn(async (command, args) => {
      if (command === "probe-test") return { stdout: '{"format":{"duration":"12"}}', stderr: "" };
      await writeFile(args[args.length - 1], jpg);
      return { stdout: "", stderr: "" };
    });
    const result = await new VideoFrameExtractor(runner).extract(video, {
      ...baseOptions(), maxFrames: 3, ffprobePath: "probe-test", ffmpegPath: "ffmpeg-test",
    });
    expect(result.timestamps).toEqual([2, 6, 10]);
    expect(result.frames).toHaveLength(3);
    expect(result.frames[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(runner).toHaveBeenCalledTimes(4);
    expect((runner as any).mock.calls[1][1]).toContain("-nostdin");
  });
});

function baseOptions() {
  return { maxSizeMB: 100, maxDurationSeconds: 120, maxFrames: 5 };
}
