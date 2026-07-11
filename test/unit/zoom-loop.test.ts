import { describe, expect, it } from "vitest";
import { gridCellToRegion, parseZoomDecision, selectZoomCells } from "../../src/tools/zoom-loop.js";

describe("Zoom pure contract", () => {
  it("解析 JSON/fence 并拒绝越界 cell", () => {
    expect(parseZoomDecision('```json\n{"action":"final","answer":"ok"}\n```')).toEqual({ action: "final", answer: "ok" });
    expect(() => parseZoomDecision('{"action":"zoom","cells":[{"row":3,"column":0,"reason":"x"}]}')).toThrow();
  });

  it("重复区域去重并按图片预算截断", () => {
    const result = selectZoomCells([
      { row: 2, column: 2, reason: "a" },
      { row: 0, column: 1, reason: "b" },
      { row: 0, column: 1, reason: "dup" },
    ], 1);
    expect(result.cells).toEqual([{ row: 0, column: 1, reason: "b" }]);
    expect(result.warnings).toHaveLength(2);
  });

  it("3×3 区域含重叠且始终位于图片内", () => {
    const center = gridCellToRegion(300, 240, { row: 1, column: 1 });
    expect(center.left).toBeLessThan(100);
    expect(center.top).toBeLessThan(80);
    expect(center.left + center.width).toBeLessThanOrEqual(300);
    expect(center.top + center.height).toBeLessThanOrEqual(240);
  });
});
