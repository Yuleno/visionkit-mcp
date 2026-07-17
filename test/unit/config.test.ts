import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const ORIGINAL_ENV = { ...process.env };

function setRequiredEnv(): void {
  process.env.VISIONKIT_API_KEY = "test-key";
  process.env.VISIONKIT_BASE_URL = "https://example.test/v1";
  process.env.VISIONKIT_MODEL = "test-model";
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("运行配置", () => {
  it("使用安全默认值并解析显式配置", () => {
    setRequiredEnv();
    process.env.MAX_TOKENS = "4096";
    process.env.TEMPERATURE = "0.2";
    process.env.TOP_P = "0.8";
    process.env.ENABLE_THINKING = "false";
    process.env.MULTI_CROP = "0";
    process.env.MULTI_CROP_MAX_TILES = "3";

    expect(loadConfig()).toMatchObject({
      maxTokens: 4096,
      temperature: 0.2,
      topP: 0.8,
      enableThinking: false,
      multiCrop: false,
      multiCropMaxTiles: 3,
    });
  });

  it.each([
    ["MAX_TOKENS", "NaN"],
    ["MAX_TOKENS", "-1"],
    ["TEMPERATURE", "2.1"],
    ["TOP_P", "1.1"],
    ["MULTI_CROP_MAX_TILES", "0"],
    ["ENABLE_THINKING", "yes"],
  ])("拒绝非法参数 %s=%s", (name, value) => {
    setRequiredEnv();
    process.env[name] = value;
    expect(() => loadConfig()).toThrow();
  });

  it("拒绝非 HTTP(S) endpoint", () => {
    setRequiredEnv();
    process.env.VISIONKIT_BASE_URL = "file:///tmp/model";
    expect(() => loadConfig()).toThrow(/http or https/);
  });

  it("缺少连接三件套时给出具体变量名", () => {
    delete process.env.VISIONKIT_API_KEY;
    delete process.env.VISIONKIT_BASE_URL;
    delete process.env.VISIONKIT_MODEL;
    expect(() => loadConfig()).toThrow(/VISIONKIT_API_KEY is required/);
  });
});
