import { describe, it, expect, vi } from "vitest";
import path from "path";
import { readFileSync } from "fs";
import { makeHandler } from "../../src/tools/handler.js";
import { TOOL_DEFS } from "../../src/tools/definitions.js";
import type { VisionClient } from "../../src/vision-client.js";

const fixture = path.join(__dirname, "../fixtures/tiny.png");

function fakeClient(capture?: { prompt?: string }): VisionClient {
  return {
    name: "fake",
    model: "fake-model",
    capabilities: { maxImages: 5, nativeVideo: false, toolCalling: false, grounding: false, systemPromptMode: "merge_user" },
    analyze: vi.fn(
      async (request) => {
        if (capture) capture.prompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
        return { text: "模型返回的分析结果" };
      }
    ),
    analyzeImage: async () => "模型返回的分析结果",
    getModelName: () => "fake-model",
  };
}

const baseConfig: any = {
  provider: "custom",
  multiCrop: true,
  multiCropMaxTiles: 5,
  enableThinking: true,
};

describe("makeHandler", () => {
  it("Agentic Zoom 候选工具只加载一次媒体并可直接完成", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "extract_text_from_screenshot")!;
    const client = fakeClient();
    (client.analyze as any).mockResolvedValue({ text: '{"action":"final","answer":"提取结果"}' });
    const mediaLoader = {
      load: vi.fn(async () => [{
        buffer: readFileSync(fixture), mimeType: "image/png", width: 1, height: 1,
        role: "primary" as const, sourceIndex: 0,
      }]),
    };
    const handler = makeHandler(
      def,
      client,
      { ...baseConfig, agenticZoom: { enabled: true, maxZoomRounds: 1 } },
      { maxImages: 5 },
      { mediaLoader }
    );
    const res: any = await handler({ image_source: "virtual.png", prompt: "提取" });
    expect(mediaLoader.load).toHaveBeenCalledTimes(1);
    expect(res.structuredContent.text).toBe("提取结果");
    expect(res.structuredContent.rounds).toBe(1);
  });

  it("image_analysis 工具调通并返回 structuredContent", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "image_analysis")!;
    const client = fakeClient();
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    const res: any = await handler({ image_source: fixture, prompt: "描述这张图" });
    expect(res.structuredContent).toBeDefined();
    expect(res.structuredContent.provider).toBe("custom");
    expect(res.structuredContent.model).toBe("fake-model");
    expect(res.structuredContent.warnings).toEqual([]);
    expect(res.structuredContent.rounds).toBe(1);
    expect(res.structuredContent.text).toBe("模型返回的分析结果");
    expect(res.structuredContent.detailProfile).toMatch(/^(text|balanced|overview)$/);
  });

  it("image_analysis auto 命中 TEXT_HEAVY 正则 → detailProfile=text", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "image_analysis")!;
    const client = fakeClient();
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    // "提取文字" 命中 TEXT_HEAVY_PROMPT_PATTERN (文字/提取)
    const res: any = await handler({ image_source: fixture, prompt: "提取文字" });
    expect(res.structuredContent.detailProfile).toBe("text");
  });

  it("image_analysis auto 未命中正则 → infer 走图片启发式(返回 text 或 balanced)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "image_analysis")!;
    const client = fakeClient();
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    // "描述风景" 不命中任何 text-heavy 关键词
    const res: any = await handler({ image_source: fixture, prompt: "描述风景" });
    expect(res.structuredContent.detailProfile).toMatch(/^(text|balanced)$/);
  });

  it("ui_to_artifact output_type=spec 切换到 ui_to_artifact_spec prompt(含设计令牌)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "ui_to_artifact")!;
    const capture: { prompt?: string } = {};
    const client = fakeClient(capture);
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    await handler({ image_source: fixture, prompt: "生成产物", output_type: "spec" });
    expect(capture.prompt).toContain("设计令牌");
  });

  it("ui_to_artifact output_type=code 走 ui_to_artifact_code prompt(含代码块)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "ui_to_artifact")!;
    const capture: { prompt?: string } = {};
    const client = fakeClient(capture);
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    await handler({ image_source: fixture, prompt: "生成产物", output_type: "code" });
    expect(capture.prompt).toContain("```html");
  });

  it("extract_text_from_screenshot 默认纯原文 prompt(不含 ## 提取文本)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "extract_text_from_screenshot")!;
    const capture: { prompt?: string } = {};
    const client = fakeClient(capture);
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    await handler({ image_source: fixture, prompt: "提取" });
    expect(capture.prompt).not.toMatch(/## 提取文本/);
  });

  it("extract_text_from_screenshot structured=true 含 ## 提取文本", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "extract_text_from_screenshot")!;
    const capture: { prompt?: string } = {};
    const client = fakeClient(capture);
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    await handler({ image_source: fixture, prompt: "提取", structured: true });
    expect(capture.prompt).toMatch(/## 提取文本/);
  });

  it("无效图片来源返回 createErrorResponse(isError=true)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "image_analysis")!;
    const client = fakeClient();
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    const res: any = await handler({ image_source: "nonexistent.png", prompt: "描述" });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(client.analyze).not.toHaveBeenCalled();
  });

  it("ui_diff_check 双图调通(twoImages media)", async () => {
    const def = TOOL_DEFS.find((t) => t.name === "ui_diff_check")!;
    const capture: { prompt?: string } = {};
    const client = fakeClient(capture);
    const handler = makeHandler(def, client, baseConfig, { maxImages: 5 });
    const res: any = await handler({
      expected_image_source: fixture,
      actual_image_source: fixture,
      prompt: "对比差异",
    });
    expect(res.structuredContent).toBeDefined();
    expect(res.structuredContent.rounds).toBe(1);
    // composePrompt 应包含两图图例
    expect(capture.prompt).toContain("图1");
    expect(capture.prompt).toContain("图2");
  });
});
