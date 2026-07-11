import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { AgenticZoomExecution } from "../../src/tools/execution-strategy.js";

let buffer: Buffer;
beforeAll(async () => { buffer = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer(); });

function input(analyze: any, maxImages = 5) {
  const client: any = {
    name: "fake", model: "fake", capabilities: { maxImages }, analyze: vi.fn(analyze), getModelName: () => "fake",
  };
  return {
    client,
    input: {
      images: [{ dataUrl: "overview", role: "primary" as const, view: "overview" as const, sourceIndex: 0 }],
      systemPrompt: "专项系统提示词",
      userPrompt: "读取细节",
      client,
      rawItems: [{ source: "x", role: "primary" as const }],
      media: [{ buffer, mimeType: "image/png", width: 300, height: 300, role: "primary" as const, sourceIndex: 0 }],
      maxImages,
      preparationWarnings: [],
    },
  };
}

describe("AgenticZoomExecution", () => {
  it("无需 Zoom 时保留专项 system prompt 并只调用一次", async () => {
    const { client, input: value } = input(async () => ({ text: '{"action":"final","answer":"done"}' }));
    const result = await new AgenticZoomExecution().execute(value);
    expect(result).toMatchObject({ text: "done", rounds: 1 });
    expect(client.analyze.mock.calls[0][0].systemPrompt).toContain("专项系统提示词");
  });

  it("maxImages=2 时只发送总览和一个裁剪并产生截断 warning", async () => {
    let call = 0;
    const { client, input: value } = input(async () => ++call === 1
      ? ({ text: '{"action":"zoom","cells":[{"row":2,"column":2,"reason":"a"},{"row":0,"column":0,"reason":"b"}]}' })
      : ({ text: "final answer" }), 2);
    const result = await new AgenticZoomExecution().execute(value);
    expect(result.rounds).toBe(2);
    expect(client.analyze.mock.calls[1][0].images).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("截断");
  });

  it("规划 JSON 无效时使用原预处理图降级完成", async () => {
    let call = 0;
    const { input: value } = input(async () => ++call === 1 ? ({ text: "not json" }) : ({ text: "fallback" }));
    const result = await new AgenticZoomExecution().execute(value);
    expect(result).toMatchObject({ text: "fallback", rounds: 2 });
    expect(result.warnings.join(" ")).toContain("已降级");
  });

  it("瞬时失败重试不增加逻辑 rounds", async () => {
    let attempt = 0;
    const { input: value } = input(async () => {
      if (++attempt === 1) throw new Error("temporary");
      return { text: '{"action":"final","answer":"ok"}' };
    });
    const result = await new AgenticZoomExecution().execute(value);
    expect(result).toMatchObject({ text: "ok", rounds: 1 });
  });
});
