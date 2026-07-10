import { describe, it, expect } from "vitest";
import { TOOL_DEFS } from "../../src/tools/definitions.js";

describe("TOOL_DEFS", () => {
  it("恰好 7 个工具(不含 video)", () => {
    expect(TOOL_DEFS).toHaveLength(7);
    expect(TOOL_DEFS.find(t => t.name === "video_analysis")).toBeUndefined();
  });
  it("含 image_analysis 通用兜底", () => {
    expect(TOOL_DEFS.find(t => t.name === "image_analysis")).toBeDefined();
  });
  it("不含 image_understand", () => {
    expect(TOOL_DEFS.find(t => t.name === "image_understand")).toBeUndefined();
  });
  it("每个工具有 outputShape 和 detailProfile", () => {
    for (const t of TOOL_DEFS) {
      expect(t.outputShape).toBeDefined();
      expect(t.detailProfile).toBeDefined();
    }
  });
  it("ui_diff_check 要求 minImages=2", () => {
    const diff = TOOL_DEFS.find(t => t.name === "ui_diff_check")!;
    expect(diff.requiredCapabilities?.minImages).toBe(2);
    expect(diff.media).toBe("twoImages");
  });
  it("extract_text 和 diagnose_error 固定 text profile", () => {
    expect(TOOL_DEFS.find(t => t.name === "extract_text_from_screenshot")!.detailProfile).toBe("text");
    expect(TOOL_DEFS.find(t => t.name === "diagnose_error_screenshot")!.detailProfile).toBe("text");
  });
});
