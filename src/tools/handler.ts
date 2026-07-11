import type { ToolDef } from "./definitions.js";
import type { Capabilities, VisionClient } from "../vision-client.js";
import type { VisionKitConfig } from "../config.js";
import { buildPrompt } from "./prompts.js";
import {
  FixedMultiCropPreparation,
  toPreparationProfile,
  type MediaItem,
} from "../media/detail-strategy.js";
import { SinglePassExecution } from "./execution-strategy.js";
import { validateImageSource } from "../image-processor.js";
import {
  withRetry,
  createStructuredSuccessResponse,
  createErrorResponse,
} from "../utils/helpers.js";
import { TEXT_HEAVY_PROMPT_PATTERN } from "../constants.js";

export function makeHandler(
  def: ToolDef,
  client: VisionClient,
  config: VisionKitConfig,
  capabilities: Pick<Capabilities, "maxImages">
) {
  const preparation = new FixedMultiCropPreparation();
  const execution = new SinglePassExecution();

  return async (params: Record<string, unknown>) => {
    try {
      // 1. 构造 MediaItem
      const items: MediaItem[] = buildMediaItems(def, params);

      // 2. 校验图片来源
      for (const it of items) {
        await validateImageSource(it.source);
      }

      // 3. 解析 detailProfile(auto → 正则命中 text, 否则 infer)
      const userPrompt = (params.prompt as string) || "";
      const detailProfile = resolveDetailProfile(def, userPrompt);
      const prepProfile = toPreparationProfile(detailProfile);

      // 4. 预处理
      const prepOut = await preparation.prepare({
        items,
        profile: prepProfile,
        maxImages: capabilities.maxImages,
      });

      // 5. 拼 system prompt(ui_to_artifact 按 output_type 切)
      const promptKey = resolvePromptKey(def, params);
      const systemPrompt = buildPrompt(promptKey, {
        userPrompt,
        structured: params.structured as boolean | undefined,
      });

      // 6. 执行(只重试模型调用)
      const thinking = resolveThinking(def, config);
      const execResult = await withRetry(
        () =>
          execution.execute({
            images: prepOut.images,
            systemPrompt,
            userPrompt,
            thinking,
            client,
            rawItems: items,
            preparationWarnings: prepOut.warnings,
          }),
        2,
        1000
      )();

      // 7. 双输出
      return createStructuredSuccessResponse({
        text: execResult.text,
        provider: config.provider,
        model: client.getModelName(),
        detailProfile: prepOut.detailProfileUsed,
        rounds: execResult.rounds,
        warnings: execResult.warnings ?? [],
      });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : String(err));
    }
  };
}

function buildMediaItems(def: ToolDef, params: Record<string, unknown>): MediaItem[] {
  if (def.media === "twoImages") {
    return [
      { source: params.expected_image_source as string, role: "expected" },
      { source: params.actual_image_source as string, role: "actual" },
    ];
  }
  return [{ source: params.image_source as string, role: "primary" }];
}

function resolveDetailProfile(
  def: ToolDef,
  prompt: string
): "text" | "balanced" | "overview" | "auto" {
  if (def.detailProfile !== "auto") return def.detailProfile;
  // auto 两阶段(spec 第5节):正则命中 → text,未命中 → auto(交 prepare 的 infer 图片启发式)
  return TEXT_HEAVY_PROMPT_PATTERN.test(prompt) ? "text" : "auto";
}

function resolvePromptKey(
  def: ToolDef,
  params: Record<string, unknown>
): import("./prompts.js").PromptKey {
  if (def.name === "ui_to_artifact") {
    return params.output_type === "spec" ? "ui_to_artifact_spec" : "ui_to_artifact_code";
  }
  return def.promptKey;
}

function resolveThinking(def: ToolDef, config: VisionKitConfig): boolean {
  if (def.thinkingPolicy === "on") return true;
  if (def.thinkingPolicy === "off") return false;
  return config.enableThinking; // profile_default
}
