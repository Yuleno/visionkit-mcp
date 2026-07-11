import { describe, expect, it, vi } from "vitest";
import { makeVideoHandler } from "../../src/tools/video-handler.js";

describe("video handler", () => {
  it("按时间顺序发送帧并返回标准 structuredContent", async () => {
    const client: any = {
      analyze: vi.fn(async () => ({ text: "视频结果", warnings: ["provider-warning"] })),
      getModelName: () => "fake-video-model",
    };
    const extractor: any = {
      extract: vi.fn(async () => ({
        frames: ["frame1", "frame2"], timestamps: [1.5, 4.5], durationSeconds: 6,
        warnings: ["已抽取2帧"],
      })),
    };
    const handler = makeVideoHandler(client, {
      provider: "custom", enableThinking: false,
      video: { maxSizeMB: 100, maxDurationSeconds: 120, maxFrames: 5 },
    } as any, 2, extractor);
    const result: any = await handler({ video_source: "sample.mp4", prompt: "分析变化" });
    expect(client.analyze).toHaveBeenCalledWith(expect.objectContaining({ images: ["frame1", "frame2"] }));
    expect(client.analyze.mock.calls[0][0].userPrompt).toContain("图1: 0:01.5 / 图2: 0:04.5");
    expect(result.structuredContent).toMatchObject({ text: "视频结果", detailProfile: "video", rounds: 1 });
    expect(result.structuredContent.warnings).toEqual(["已抽取2帧", "provider-warning"]);
  });
});
