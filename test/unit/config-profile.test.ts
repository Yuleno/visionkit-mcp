import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createCustomProfileConfig } from "../../src/profile-config.js";

const originalEnv = { ...process.env };
let tempDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("loadConfig with profile config file", () => {
  it("loads a custom provider profile from VISIONKIT_CONFIG_FILE", () => {
    tempDir = join(tmpdir(), `visionkit-config-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const configPath = join(tempDir, "config.json");
    const profileConfig = createCustomProfileConfig({
      endpoint: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      apiKey: "mimo-key",
    });
    writeFileSync(configPath, JSON.stringify(profileConfig), "utf8");

    vi.stubEnv("VISIONKIT_CONFIG_FILE", configPath);
    vi.stubEnv("MODEL_PROVIDER", undefined);
    vi.stubEnv("CUSTOM_API_KEY", undefined);
    vi.stubEnv("CUSTOM_BASE_URL", undefined);
    vi.stubEnv("CUSTOM_MODEL_NAME", undefined);

    const config = loadConfig();

    expect(config.provider).toBe("custom");
    expect(config.model).toBe("mimo-v2.5");
    expect(config.customProvider).toMatchObject({
      apiKey: "mimo-key",
      baseUrl: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      authHeader: "custom",
      authHeaderValue: "api-key: {{key}}",
    });
  });

  it("does not let a custom profile model override an explicit built-in provider", () => {
    tempDir = join(tmpdir(), `visionkit-config-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const configPath = join(tempDir, "config.json");
    const profileConfig = createCustomProfileConfig({
      endpoint: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      apiKey: "mimo-key",
    });
    writeFileSync(configPath, JSON.stringify(profileConfig), "utf8");

    vi.stubEnv("VISIONKIT_CONFIG_FILE", configPath);
    vi.stubEnv("MODEL_PROVIDER", "zhipu");
    vi.stubEnv("MODEL_NAME", undefined);

    const config = loadConfig();

    expect(config.provider).toBe("zhipu");
    expect(config.model).toBe("glm-4.6v");
    expect(config.customProvider).toBeUndefined();
  });
});

describe("loadConfig capability overrides", () => {
  function useMissingConfigFile() {
    vi.stubEnv(
      "VISIONKIT_CONFIG_FILE",
      join(tmpdir(), `visionkit-missing-${Date.now()}-${Math.random()}.json`)
    );
    vi.stubEnv("MODEL_PROVIDER", "zhipu");
  }

  it("解析全部 capability override，并正确处理 false/0", () => {
    useMissingConfigFile();
    vi.stubEnv("VISIONKIT_MAX_IMAGES", "7");
    vi.stubEnv("VISIONKIT_NATIVE_VIDEO", "false");
    vi.stubEnv("VISIONKIT_TOOL_CALLING", "1");
    vi.stubEnv("VISIONKIT_GROUNDING", "0");
    vi.stubEnv("VISIONKIT_SYSTEM_PROMPT_MODE", "native");

    expect(loadConfig().capabilityOverrides).toEqual({
      maxImages: 7,
      nativeVideo: false,
      toolCalling: true,
      grounding: false,
      systemPromptMode: "native",
    });
  });

  it.each([
    ["VISIONKIT_MAX_IMAGES", "0"],
    ["VISIONKIT_MAX_IMAGES", "1.5"],
    ["VISIONKIT_NATIVE_VIDEO", "yes"],
    ["VISIONKIT_SYSTEM_PROMPT_MODE", "unsupported"],
  ])("拒绝非法 capability override %s=%s", (name, value) => {
    useMissingConfigFile();
    vi.stubEnv(name, value);

    expect(() => loadConfig()).toThrow();
  });
});
