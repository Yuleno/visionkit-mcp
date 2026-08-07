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

  describe("protocol 与端点严格度（显式优先 + 路径信号兜底）", () => {
    it("默认 protocol=openai、anthropicStrictness=vendor-loose（无路径信号时）", () => {
      setRequiredEnv();
      process.env.VISIONKIT_BASE_URL = "https://api.example.com/v1";
      const cfg = loadConfig();
      expect(cfg.protocol).toBe("openai");
      expect(cfg.anthropicStrictness).toBe("vendor-loose");
    });

    it("显式 openai/anthropic 最高优先，覆盖路径信号", () => {
      setRequiredEnv();
      // 路径含 /anthropic 但显式 openai → openai
      process.env.VISIONKIT_BASE_URL = "https://dashscope.aliyuncs.com/apps/anthropic";
      process.env.VISIONKIT_PROTOCOL = "openai";
      expect(loadConfig().protocol).toBe("openai");
      // 纯 host 但显式 anthropic → anthropic
      process.env.VISIONKIT_BASE_URL = "http://evo4.local:20128";
      process.env.VISIONKIT_PROTOCOL = "anthropic";
      expect(loadConfig().protocol).toBe("anthropic");
    });

    it("base_url 路径含 /anthropic 段 → 未声明协议时默认 anthropic", () => {
      setRequiredEnv();
      process.env.VISIONKIT_BASE_URL = "https://dashscope.aliyuncs.com/apps/anthropic";
      expect(loadConfig().protocol).toBe("anthropic");
      process.env.VISIONKIT_BASE_URL = "https://api.xiaomimimo.com/anthropic";
      expect(loadConfig().protocol).toBe("anthropic");
      process.env.VISIONKIT_BASE_URL = "https://open.bigmodel.cn/api/anthropic";
      expect(loadConfig().protocol).toBe("anthropic");
    });

    it("hostname 为 api.anthropic.com → 未声明协议时默认 anthropic", () => {
      setRequiredEnv();
      process.env.VISIONKIT_BASE_URL = "https://api.anthropic.com";
      expect(loadConfig().protocol).toBe("anthropic");
    });

    it("路径段子串 anthropic-bridge 不误判为 anthropic", () => {
      setRequiredEnv();
      process.env.VISIONKIT_BASE_URL = "https://gateway.example.com/anthropic-bridge/v1";
      expect(loadConfig().protocol).toBe("openai");
    });

    it("普通 OpenAI 兼容端点未声明协议 → openai", () => {
      setRequiredEnv();
      process.env.VISIONKIT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
      expect(loadConfig().protocol).toBe("openai");
    });

    it("显式 anthropicStrictness=strict 覆盖默认 vendor-loose", () => {
      setRequiredEnv();
      process.env.VISIONKIT_PROTOCOL = "anthropic";
      process.env.VISIONKIT_ANTHROPIC_STRICTNESS = "strict";
      expect(loadConfig().anthropicStrictness).toBe("strict");
    });

    it("非法 protocol 值回退为 openai", () => {
      setRequiredEnv();
      process.env.VISIONKIT_PROTOCOL = "gemini";
      expect(loadConfig().protocol).toBe("openai");
    });
  });
});
