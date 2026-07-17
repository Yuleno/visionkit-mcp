import { describe, it, expect } from "vitest";
import { prepareVisionImageInput } from "../../src/media/prepare-image.js";
import path from "path";

describe("prepareVisionImageInput preferTextUsed", () => {
  const fixture = path.join(__dirname, "../fixtures/tiny.png");
  it("显式 preferText=true 时 preferTextUsed=true", async () => {
    const r = await prepareVisionImageInput(fixture, { preferText: true, maxTiles: 1 });
    expect(r.preferTextUsed).toBe(true);
  });
  it("显式 preferText=false 时 preferTextUsed=false", async () => {
    const r = await prepareVisionImageInput(fixture, { preferText: false, maxTiles: 1 });
    expect(r.preferTextUsed).toBe(false);
  });
  it("preferText=undefined 时 preferTextUsed 是 boolean(由图片启发式决定)", async () => {
    const r = await prepareVisionImageInput(fixture, { maxTiles: 1 });
    expect(typeof r.preferTextUsed).toBe("boolean");
  });
});
