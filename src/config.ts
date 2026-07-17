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

const RuntimeConfigSchema = z.object({
  apiKey: z.string({ required_error: "VISIONKIT_API_KEY is required" })
    .trim().min(1, "VISIONKIT_API_KEY is required"),
  baseUrl: z.string({ required_error: "VISIONKIT_BASE_URL is required" })
    .trim().url("VISIONKIT_BASE_URL must be a valid URL").refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    "VISIONKIT_BASE_URL must use http or https"
  ),
  model: z.string({ required_error: "VISIONKIT_MODEL is required" })
    .trim().min(1, "VISIONKIT_MODEL is required"),
  maxTokens: z.coerce.number().int().positive().max(1_000_000).default(8192),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  topP: z.coerce.number().min(0).max(1).default(0.95),
  enableThinking: EnvBoolean.default("true"),
  multiCrop: EnvBoolean.default("true"),
  multiCropMaxTiles: z.coerce.number().int().min(1).max(20).default(5),
  baseVisionPrompt: z.string().optional(),
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

  const runtime = RuntimeConfigSchema.parse({
    apiKey: process.env.VISIONKIT_API_KEY,
    baseUrl: process.env.VISIONKIT_BASE_URL,
    model: process.env.VISIONKIT_MODEL,
    maxTokens: process.env.MAX_TOKENS,
    temperature: process.env.TEMPERATURE,
    topP: process.env.TOP_P,
    enableThinking: process.env.ENABLE_THINKING,
    multiCrop: process.env.MULTI_CROP,
    multiCropMaxTiles: process.env.MULTI_CROP_MAX_TILES,
    baseVisionPrompt: process.env.BASE_VISION_PROMPT,
  });

  return {
    provider: "custom",
    apiKey: runtime.apiKey,
    model: runtime.model,
    maxTokens: runtime.maxTokens,
    temperature: runtime.temperature,
    topP: runtime.topP,
    enableThinking: runtime.enableThinking,
    multiCrop: runtime.multiCrop,
    multiCropMaxTiles: runtime.multiCropMaxTiles,
    baseVisionPrompt: runtime.baseVisionPrompt,
    customProvider: {
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      model: runtime.model,
    },
    capabilityOverrides,
    agenticZoom,
    video,
  };
}
