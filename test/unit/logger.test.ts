import { join } from "path";
import { describe, expect, it } from "vitest";
import { getDefaultLogDirectory } from "../../src/utils/logger.js";

describe("getDefaultLogDirectory", () => {
  it("stores development logs under the project directory", () => {
    const projectDir = join("workspace", "visionkit-mcp");

    expect(getDefaultLogDirectory(projectDir)).toBe(
      join(projectDir, ".visionkit-mcp", "logs")
    );
  });
});
