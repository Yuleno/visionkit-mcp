import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export type ProfileProvider = "custom";
export type ProfileAuthHeader = "bearer" | "x-api-key" | "custom";
export type ProfileThinkingMode = "disabled" | "openai" | "qwen_extra_body";

export interface ConfiguredProfile {
  provider: ProfileProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  authHeader: ProfileAuthHeader;
  authHeaderValue?: string;
  path: string;
  thinkingMode: ProfileThinkingMode;
}

export interface VisionKitUserConfig {
  defaultProfile: string;
  profiles: Record<string, ConfiguredProfile>;
}

export interface CustomProfileAnswers {
  endpoint: string;
  model: string;
  apiKey: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

function inferAuth(endpoint: string): {
  authHeader: ProfileAuthHeader;
  authHeaderValue?: string;
} {
  const hostname = new URL(endpoint).hostname.toLowerCase();

  if (hostname === "api.xiaomimimo.com" || hostname.endsWith(".xiaomimimo.com")) {
    return {
      authHeader: "custom",
      authHeaderValue: "api-key: {{key}}",
    };
  }

  return { authHeader: "bearer" };
}

export function createCustomProfileConfig(
  answers: CustomProfileAnswers
): VisionKitUserConfig {
  const baseUrl = normalizeEndpoint(answers.endpoint);
  const model = answers.model.trim();
  const apiKey = answers.apiKey.trim();
  const auth = inferAuth(baseUrl);

  if (!baseUrl) {
    throw new Error("API endpoint cannot be empty");
  }
  if (!model) {
    throw new Error("Model name cannot be empty");
  }
  if (!apiKey) {
    throw new Error("API key cannot be empty");
  }

  return {
    defaultProfile: model,
    profiles: {
      [model]: {
        provider: "custom",
        baseUrl,
        model,
        apiKey,
        authHeader: auth.authHeader,
        authHeaderValue: auth.authHeaderValue,
        path: "/chat/completions",
        thinkingMode: "disabled",
      },
    },
  };
}

export function getDefaultUserConfigPath(): string {
  return join(homedir(), ".visionkit-mcp", "config.json");
}

export function readUserConfig(
  configPath: string = getDefaultUserConfigPath()
): VisionKitUserConfig | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }

  const raw = readFileSync(configPath, "utf8");
  return JSON.parse(raw) as VisionKitUserConfig;
}

export function writeUserConfig(
  config: VisionKitUserConfig,
  configPath: string = getDefaultUserConfigPath()
): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function resolveConfiguredProfile(
  env: { VISIONKIT_PROFILE?: string },
  config?: VisionKitUserConfig
): ConfiguredProfile | undefined {
  if (!config) {
    return undefined;
  }

  const profileName = env.VISIONKIT_PROFILE || config.defaultProfile;
  return config.profiles[profileName];
}
