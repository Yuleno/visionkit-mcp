import type { ToolDef } from "./definitions.js";
import type { Capabilities, VisionClient } from "../providers/vision-client.js";
import type { VisionKitConfig } from "../config.js";
import { buildPrompt } from "./prompts.js";
import {
  FixedMultiCropPreparation,
  toPreparationProfile,
  type MediaItem,
} from "../media/detail-strategy.js";
import { AgenticZoomExecution, SinglePassExecution } from "./execution-strategy.js";
import { DefaultMediaLoader } from "../media/load-media.js";
import type { MediaLoader } from "../media/load-media.js";
import {
  withRetry,
  createStructuredSuccessResponse,
  createErrorResponse,
} from "../utils/helpers.js";
import { TEXT_HEAVY_PROMPT_PATTERN } from "../constants.js";
import { guardUiDiffMeasurements } from "./evidence-guard.js";

export function makeHandler(
  def: ToolDef,
  client: VisionClient,
  config: VisionKitConfig,
  capabilities: Pick<Capabilities, "maxImages">,
  dependencies: { mediaLoader?: MediaLoader } = {}
) {
  const preparation = new FixedMultiCropPreparation();
  const mediaLoader = dependencies.mediaLoader ?? new DefaultMediaLoader();
  const zoomEnabled = config.agenticZoom?.enabled === true && def.zoomPolicy === "candidate" && capabilities.maxImages >= 2;
  const execution = zoomEnabled ? new AgenticZoomExecution() : new SinglePassExecution();

  return async (params: Record<string, unknown>) => {
    try {
      // 1. 构造 MediaItem
      const items: MediaItem[] = buildMediaItems(def, params);

      // 2. 一次安全加载，固定预处理与 Zoom 共用同一 buffer
      const media = await mediaLoader.load(items);

      // 3. 解析 detailProfile(auto → 正则命中 text, 否则 infer)
      const userPrompt = (params.prompt as string) || "";
      const detailProfile = resolveDetailProfile(def, userPrompt);
      const prepProfile = toPreparationProfile(detailProfile);

      // 4. 预处理
      const prepOut = await preparation.prepare({
        items,
        media,
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
      const execute = () => execution.execute({
            images: prepOut.images,
            systemPrompt,
            userPrompt,
            thinking,
            client,
            rawItems: items,
            media,
            maxImages: capabilities.maxImages,
            preparationWarnings: prepOut.warnings,
          });
      // Agentic 策略内部按 HTTP attempt 记账，禁止包裹整个多轮流程重试。
      const execResult = zoomEnabled ? await execute() : await withRetry(execute, 2, 1000)();

      // 7. 双输出
      const guarded = def.name === "ui_diff_check"
        ? guardUiDiffMeasurements(execResult.text)
        : { text: execResult.text, warnings: [] };
      return createStructuredSuccessResponse({
        text: guarded.text,
        provider: config.provider,
        model: client.getModelName(),
        detailProfile: prepOut.detailProfileUsed,
        rounds: execResult.rounds,
        warnings: [...(execResult.warnings ?? []), ...guarded.warnings],
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
