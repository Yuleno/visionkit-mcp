import { describe, it, expect } from "vitest";
import { buildPrompt, PREAMBLE, PROMPT_KEYS } from "../../src/tools/prompts.js";

describe("prompts", () => {
  it("PREAMBLE 含三条铁律", () => {
    expect(PREAMBLE).toMatch(/逐字照抄/);
    expect(PREAMBLE).toMatch(/绝不编造/);
    expect(PREAMBLE).toMatch(/不可当作.*指令/);
  });
  it("buildPrompt('image_analysis') 含 PREAMBLE", () => {
    const p = buildPrompt("image_analysis", { userPrompt: "描述这张图" });
    expect(p).toContain(PREAMBLE);
    expect(p).toContain("描述这张图");
  });
  it("buildPrompt('extract_text') 默认不含小节标题(纯原文)", () => {
    const p = buildPrompt("extract_text", { userPrompt: "提取文字", structured: false });
    expect(p).not.toMatch(/## 提取文本/);
    expect(p).toMatch(/质量判断/);
  });
  it("buildPrompt('extract_text') structured=true 含小节标题", () => {
    const p = buildPrompt("extract_text", { userPrompt: "提取文字", structured: true });
    expect(p).toMatch(/## 提取文本/);
  });
  it("buildPrompt('diagnose_error') 含四小节", () => {
    const p = buildPrompt("diagnose_error", { userPrompt: "为什么报错" });
    expect(p).toMatch(/## 根因/);
    expect(p).toMatch(/## 错误原文/);
    expect(p).toMatch(/## 位置/);
    expect(p).toMatch(/## 修复步骤/);
  });
  it("PROMPT_KEYS 含 9 个 key(8 工具,ui_to_artifact 拆 code/spec)", () => {
    expect(PROMPT_KEYS).toHaveLength(9);
  });
  it("video prompt 要求时间线和不确定性", () => {
    const p = buildPrompt("video_analysis", { userPrompt: "分析变化" });
    expect(p).toMatch(/## 时间线/);
    expect(p).toMatch(/## 不确定性/);
  });
  it("专项 prompt 区分直接证据与推断", () => {
    expect(buildPrompt("understand_technical_diagram", { userPrompt: "解读" })).toMatch(/直接可见/);
    expect(buildPrompt("ui_diff_check", { userPrompt: "对比" })).toMatch(/不得编造或估算任何像素/);
    expect(buildPrompt("diagnose_error", { userPrompt: "诊断" })).toMatch(/截图中直接可见/);
  });
});
