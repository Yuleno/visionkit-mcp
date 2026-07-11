import { join } from "path";
import { describe, expect, it } from "vitest";
import { getDefaultLogDirectory, redactLogValue } from "../../src/utils/logger.js";

describe("getDefaultLogDirectory", () => {
  it("stores development logs under the project directory", () => {
    const projectDir = join("workspace", "visionkit-mcp");

    expect(getDefaultLogDirectory(projectDir)).toBe(
      join(projectDir, ".visionkit-mcp", "logs")
    );
  });
});

describe("redactLogValue", () => {
  it("递归抹去密钥与图片 base64", () => {
    expect(redactLogValue({ apiKey: "secret", nested: { authorization: "Bearer token", image: "data:image/png;base64,QUJD" } })).toEqual({
      apiKey: "[REDACTED]", nested: { authorization: "[REDACTED]", image: "data:image/[REDACTED]" },
    });
  });

  it("抹去字符串中的 JSON 密钥字段与普通 token/password", () => {
    const value = redactLogValue(
      'request failed: {"apiKey":"api-secret","token":"token-secret","password":"pass-secret","authorization":"Basic auth-secret"}'
    );

    expect(value).toContain("[REDACTED]");
    expect(value).not.toContain("api-secret");
    expect(value).not.toContain("token-secret");
    expect(value).not.toContain("pass-secret");
    expect(value).not.toContain("auth-secret");
  });
});
