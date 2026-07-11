import type { VisionKitConfig } from "../config.js";
import type { VisionClient } from "../vision-client.js";
import { VideoFrameExtractor } from "../media/video-frames.js";
import { buildPrompt } from "./prompts.js";
import { createErrorResponse, createStructuredSuccessResponse, withRetry } from "../utils/helpers.js";

export function makeVideoHandler(
  client: VisionClient,
  config: VisionKitConfig,
  maxImages: number,
  extractor = new VideoFrameExtractor()
) {
  return async (params: Record<string, unknown>) => {
    try {
      const video = config.video ?? { maxSizeMB: 100, maxDurationSeconds: 120, maxFrames: 5 };
      const extracted = await extractor.extract(params.video_source as string, {
        ...video,
        maxFrames: Math.min(video.maxFrames, maxImages),
      });
      const userPrompt = String(params.prompt ?? "");
      const legend = extracted.timestamps
        .map((seconds, index) => `图${index + 1}: ${formatTimestamp(seconds)}`)
        .join(" / ");
      const systemPrompt = buildPrompt("video_analysis", { userPrompt });
      const result = await withRetry(() => client.analyze({
        images: extracted.frames,
        systemPrompt,
        userPrompt: `${legend}\n\n${userPrompt}`,
        thinking: config.enableThinking,
      }), 2, 1000)();
      return createStructuredSuccessResponse({
        text: result.text,
        provider: config.provider,
        model: client.getModelName(),
        detailProfile: "video",
        rounds: 1,
        warnings: [...extracted.warnings, ...(result.warnings ?? [])],
      });
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  };
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}
