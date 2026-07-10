import { describe, expect, it } from "vitest";
import {
  createCustomProfileConfig,
  resolveConfiguredProfile,
} from "../../src/profile-config.js";

describe("createCustomProfileConfig", () => {
  it("uses the model name as the profile name", () => {
    const config = createCustomProfileConfig({
      endpoint: "https://example.com/v1",
      model: "vision-model",
      apiKey: "sk-test",
    });

    expect(config.defaultProfile).toBe("vision-model");
    expect(config.profiles["vision-model"]?.model).toBe("vision-model");
  });

  it("detects Xiaomi MiMo api-key authentication", () => {
    const config = createCustomProfileConfig({
      endpoint: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      apiKey: "mimo-key",
    });

    expect(config.profiles["mimo-v2.5"]).toMatchObject({
      provider: "custom",
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "mimo-key",
      authHeader: "custom",
      authHeaderValue: "api-key: {{key}}",
      path: "/chat/completions",
      thinkingMode: "disabled",
    });
  });

  it("defaults generic endpoints to bearer authentication", () => {
    const config = createCustomProfileConfig({
      endpoint: "https://openrouter.ai/api/v1",
      model: "some-vision-model",
      apiKey: "openrouter-key",
    });

    expect(config.profiles["some-vision-model"]).toMatchObject({
      authHeader: "bearer",
      authHeaderValue: undefined,
    });
  });
});

describe("resolveConfiguredProfile", () => {
  it("returns the default profile when no profile env is set", () => {
    const config = createCustomProfileConfig({
      endpoint: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      apiKey: "mimo-key",
    });

    expect(resolveConfiguredProfile({}, config)?.model).toBe("mimo-v2.5");
  });

  it("lets VISIONKIT_PROFILE select a profile", () => {
    const config = {
      defaultProfile: "mimo-v2.5",
      profiles: {
        "mimo-v2.5": createCustomProfileConfig({
          endpoint: "https://api.xiaomimimo.com/v1",
          model: "mimo-v2.5",
          apiKey: "mimo-key",
        }).profiles["mimo-v2.5"],
        other: createCustomProfileConfig({
          endpoint: "https://example.com/v1",
          model: "other",
          apiKey: "other-key",
        }).profiles.other,
      },
    };

    expect(
      resolveConfiguredProfile({ VISIONKIT_PROFILE: "other" }, config)?.apiKey
    ).toBe("other-key");
  });
});
