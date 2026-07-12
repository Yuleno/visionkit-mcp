import { describe, expect, it } from "vitest";
import { scoreQualityCase, type QualityCase } from "../../src/quality/scorer.js";

const baseCase: QualityCase = {
  id: "sample",
  tool: "image_analysis",
  source: "sample.png",
  requiredFacts: [
    { id: "first", anyOf: ["Alpha", "A"] },
    { id: "second", anyOf: ["Beta"], weight: 2 },
  ],
  forbiddenClaims: [{ id: "unsupported", patterns: ["42px"] }],
  format: { requiredHeadings: ["## 结论"] },
};

describe("scoreQualityCase", () => {
  it("按同义词和权重计算关键事实召回", () => {
    const score = scoreQualityCase(baseCase, { text: "## 结论\nA" });
    expect(score.factRecall).toBeCloseTo(1 / 3);
    expect(score.matchedFacts).toEqual(["first"]);
    expect(score.missingFacts).toEqual(["second"]);
    expect(score.formatCompliant).toBe(true);
  });

  it("记录 manifest 声明的无依据表述", () => {
    const score = scoreQualityCase(baseCase, { text: "## 结论\nAlpha Beta 的距离是 42px" });
    expect(score.factRecall).toBe(1);
    expect(score.unsupportedClaims).toEqual(["unsupported"]);
  });

  it("raw OCR 禁止 markdown 标题", () => {
    const score = scoreQualityCase({ ...baseCase, format: { rawTextOnly: true } }, { text: "## 提取文本\nAlpha Beta" });
    expect(score.formatCompliant).toBe(false);
  });

  it("UI 类 case 记录未经测量的 CSS 数值", () => {
    const score = scoreQualityCase({ ...baseCase, format: { disallowStyleMeasurements: true } }, { text: "Alpha Beta #123abc 24px" });
    expect(score.unsupportedClaims).toContain("unsupported-style-measurement");
  });
});
