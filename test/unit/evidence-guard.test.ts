import { describe, expect, it } from "vitest";
import { guardUiDiffMeasurements } from "../../src/tools/evidence-guard.js";

describe("guardUiDiffMeasurements", () => {
  it("移除未经测量的 CSS 色值和尺寸", () => {
    const guarded = guardUiDiffMeasurements("按钮颜色为 #3B82F6，间距为 24px");
    expect(guarded.text).not.toMatch(/#3B82F6|24px/);
    expect(guarded.warnings).toEqual(["UI diff 已移除 2 个未经测量的精确样式数值"]);
  });

  it("不改写没有样式数值的可见事实", () => {
    const guarded = guardUiDiffMeasurements("图1按钮为蓝色，图2按钮为绿色");
    expect(guarded).toEqual({ text: "图1按钮为蓝色，图2按钮为绿色", warnings: [] });
  });
});
