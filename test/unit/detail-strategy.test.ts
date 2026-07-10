import { describe, it, expect } from "vitest";
import { FixedMultiCropPreparation, toPreparationProfile, validateItems } from "../../src/media/detail-strategy.js";

describe("toPreparationProfile", () => {
  it("auto → infer", () => {
    expect(toPreparationProfile("auto")).toBe("infer");
  });
  it("text/balanced/overview 原样", () => {
    expect(toPreparationProfile("text")).toBe("text");
    expect(toPreparationProfile("balanced")).toBe("balanced");
    expect(toPreparationProfile("overview")).toBe("overview");
  });
});

describe("validateItems", () => {
  it("单图:恰好1个 primary", () => {
    expect(() => validateItems([{source:"a",role:"primary"}], "image")).not.toThrow();
    expect(() => validateItems([{source:"a",role:"expected"}], "image")).toThrow();
    expect(() => validateItems([{source:"a",role:"primary"},{source:"b",role:"primary"}], "image")).toThrow();
  });
  it("twoImages:恰好1 expected + 1 actual", () => {
    expect(() => validateItems([{source:"a",role:"expected"},{source:"b",role:"actual"}], "twoImages")).not.toThrow();
    expect(() => validateItems([{source:"a",role:"primary"}], "twoImages")).toThrow();
    expect(() => validateItems([{source:"a",role:"expected"}], "twoImages")).toThrow();
  });
});
