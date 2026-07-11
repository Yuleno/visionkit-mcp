import { describe, it, expect, vi } from "vitest";
import { SinglePassExecution, composePrompt } from "../../src/tools/execution-strategy.js";
import type { PreparedImage } from "../../src/media/detail-strategy.js";

function fakeClient(analyze: (request: any) => Promise<{ text: string; warnings?: string[] }>) {
  return {
    name: "fake", model: "fake-model",
    capabilities: { maxImages: 5, nativeVideo: false, toolCalling: false, grounding: false, systemPromptMode: "merge_user" as const },
    analyze: vi.fn(analyze), getModelName: () => "fake-model",
  };
}

describe("composePrompt", () => {
  const imgs: PreparedImage[] = [
    { dataUrl: "d1", role: "primary", view: "overview", sourceIndex: 0 },
    { dataUrl: "d2", role: "primary", view: "crop", sourceIndex: 0 },
  ];
  it("图片编号与 images 顺序对齐", () => {
    const p = composePrompt(imgs, "看图");
    expect(p).toContain("图1: 总览");
    expect(p).toContain("图2: 细节裁剪");
    expect(p).toContain("看图");
  });
});

describe("SinglePassExecution", () => {
  it("调用 client.analyze 并返回 rounds=1", async () => {
    const client = fakeClient(async () => ({ text: "分析结果" }));
    const exec = new SinglePassExecution();
    const imgs: PreparedImage[] = [{ dataUrl: "d1", role: "primary", view: "overview", sourceIndex: 0 }];
    const r = await exec.execute({
      images: imgs, systemPrompt: "sys", userPrompt: "看图", thinking: false,
      client: client as any, rawItems: [{source:"x",role:"primary"}], preparationWarnings: ["w1"],
    });
    expect(r.text).toBe("分析结果");
    expect(r.rounds).toBe(1);
    expect(r.warnings).toEqual(["w1"]);
    expect(client.analyze).toHaveBeenCalled();
  });
  it("合并 provider warnings", async () => {
    const client = fakeClient(async () => ({ text: "ok" }));
    const exec = new SinglePassExecution();
    const r = await exec.execute({
      images: [{dataUrl:"d1",role:"primary",view:"overview",sourceIndex:0}],
      systemPrompt:"s", userPrompt:"u", client: client as any,
      rawItems:[{source:"x",role:"primary"}], preparationWarnings: ["p1"],
    });
    // client 无 warnings → 只剩 preparation
    expect(r.warnings).toEqual(["p1"]);
  });
});
