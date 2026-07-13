/**
 * 配置模块
 * custom-only：从 VISIONKIT_* 环境变量加载配置
 */

import { z } from "zod";

export interface CustomProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface VisionKitConfig {
  provider: "custom";
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  enableThinking: boolean;
  multiCrop: boolean;
  multiCropMaxTiles: number;
  baseVisionPrompt?: string;
  customProvider: CustomProviderConfig;
  capabilityOverrides?: CapabilityOverrides;
  agenticZoom?: { enabled: boolean; maxZoomRounds: 1 };
  video?: {
    maxSizeMB: number;
    maxDurationSeconds: number;
    maxFrames: number;
    ffmpegPath?: string;
    ffprobePath?: string;
  };
}

export interface CapabilityOverrides {
  maxImages?: number;
  nativeVideo?: boolean;
  toolCalling?: boolean;
  grounding?: boolean;
  systemPromptMode?: "native" | "merge_user";
}

const EnvBoolean = z.enum(["true", "false", "1", "0"]).transform(
  (value) => value === "true" || value === "1"
);

const CapabilityOverridesSchema = z.object({
  maxImages: z.coerce.number().int().positive().optional(),
  nativeVideo: EnvBoolean.optional(),
  toolCalling: EnvBoolean.optional(),
  grounding: EnvBoolean.optional(),
  systemPromptMode: z.enum(["native", "merge_user"]).optional(),
});

const AgenticZoomSchema = z.object({
  enabled: EnvBoolean.default("false"),
  maxZoomRounds: z.coerce.number().int().refine(value => value === 1, "首版仅支持 1 轮 Zoom").default(1),
});

const VideoConfigSchema = z.object({
  maxSizeMB: z.coerce.number().positive().max(100).default(100),
  maxDurationSeconds: z.coerce.number().positive().max(120).default(120),
  maxFrames: z.coerce.number().int().min(2).max(5).default(5),
  ffmpegPath: z.string().min(1).optional(),
  ffprobePath: z.string().min(1).optional(),
});

function loadCapabilityOverrides(env: NodeJS.ProcessEnv): CapabilityOverrides {
  const parsed = CapabilityOverridesSchema.parse({
    maxImages: env.VISIONKIT_MAX_IMAGES,
    nativeVideo: env.VISIONKIT_NATIVE_VIDEO,
    toolCalling: env.VISIONKIT_TOOL_CALLING,
    grounding: env.VISIONKIT_GROUNDING,
    systemPromptMode: env.VISIONKIT_SYSTEM_PROMPT_MODE,
  });
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined)
  ) as CapabilityOverrides;
}

/**
 * 从环境变量加载配置（custom-only）
 */
export function loadConfig(): VisionKitConfig {
  const capabilityOverrides = loadCapabilityOverrides(process.env);
  const agenticZoom = AgenticZoomSchema.parse({
    enabled: process.env.VISIONKIT_ENABLE_AGENTIC_ZOOM,
    maxZoomRounds: process.env.VISIONKIT_MAX_ZOOM_ROUNDS,
  }) as { enabled: boolean; maxZoomRounds: 1 };
  const video = VideoConfigSchema.parse({
    maxSizeMB: process.env.VISIONKIT_VIDEO_MAX_MB,
    maxDurationSeconds: process.env.VISIONKIT_VIDEO_MAX_SECONDS,
    maxFrames: process.env.VISIONKIT_VIDEO_MAX_FRAMES,
    ffmpegPath: process.env.VISIONKIT_FFMPEG_PATH,
    ffprobePath: process.env.VISIONKIT_FFPROBE_PATH,
  });

  // 迁移守卫：显式设置非 custom 的 MODEL_PROVIDER 时给出明确迁移指引
  const modelProvider = process.env.MODEL_PROVIDER?.toLowerCase().trim();
  if (modelProvider && modelProvider !== "custom") {
    throw new Error(
      `MODEL_PROVIDER=${modelProvider} is no longer supported. VisionKit is now custom-only. ` +
        `Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL instead. See the README configuration section.`
    );
  }

  const apiKey = process.env.VISIONKIT_API_KEY?.trim();
  const baseUrl = process.env.VISIONKIT_BASE_URL?.trim();
  const model = process.env.VISIONKIT_MODEL?.trim();

  if (!apiKey) {
    throw new Error("VISIONKIT_API_KEY is required. Set it in your MCP client env.");
  }
  if (!baseUrl) {
    throw new Error("VISIONKIT_BASE_URL is required (e.g. https://your-provider.example/v1).");
  }
  if (!model) {
    throw new Error("VISIONKIT_MODEL is required (e.g. your-model-name).");
  }

  return {
    provider: "custom",
    apiKey,
    model,
    maxTokens: parseInt(process.env.MAX_TOKENS || "8192", 10),
    temperature: parseFloat(process.env.TEMPERATURE || "0.7"),
    topP: parseFloat(process.env.TOP_P || "0.95"),
    enableThinking: process.env.ENABLE_THINKING !== "false",
    multiCrop: process.env.MULTI_CROP !== "false",
    multiCropMaxTiles: parseInt(process.env.MULTI_CROP_MAX_TILES || "5", 10),
    baseVisionPrompt: process.env.BASE_VISION_PROMPT,
    customProvider: { apiKey, baseUrl, model },
    capabilityOverrides,
    agenticZoom,
    video,
  };
}
