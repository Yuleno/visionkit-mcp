import { processBufferVariants } from "./image-crop.js";
import { encodeBufferToDataUrl } from "./image-transform.js";
import { TEXT_HEAVY_PROMPT_PATTERN } from "../constants.js";
import type { LoadedMedia } from "./load-media.js";

export type DetailProfile = "text" | "balanced" | "overview" | "auto";
export type PreparationProfile = "text" | "balanced" | "overview" | "infer";
export type ResolvedDetailProfile = "text" | "balanced" | "overview";

export interface MediaItem {
  source: string;
  role: "primary" | "expected" | "actual";
}

export interface PreparedImage {
  dataUrl: string;
  role: MediaItem["role"];
  view: "overview" | "crop";
  sourceIndex: number;
}

export interface PreparationInput {
  items: readonly MediaItem[];
  media: readonly LoadedMedia[];
  profile: PreparationProfile;
  maxImages: number;
}

export interface PreparationOutput {
  images: PreparedImage[];
  promptHints: string[];
  detailProfileUsed: ResolvedDetailProfile;
  warnings: string[];
}

export interface ImagePreparationStrategy {
  prepare(input: PreparationInput): Promise<PreparationOutput>;
}

export function toPreparationProfile(p: DetailProfile): PreparationProfile {
  return p === "auto" ? "infer" : p;
}

export function validateItems(items: readonly MediaItem[], media: "image" | "twoImages" | "video"): void {
  if (media === "image") {
    const primary = items.filter(i => i.role === "primary");
    if (items.length !== 1 || primary.length !== 1) {
      throw new Error("单图工具需恰好1个 primary");
    }
  } else if (media === "twoImages") {
    const exp = items.filter(i => i.role === "expected");
    const act = items.filter(i => i.role === "actual");
    if (exp.length !== 1 || act.length !== 1) {
      throw new Error("UI diff 需恰好1个 expected + 1个 actual");
    }
    if (items.some(i => i.role === "primary")) {
      throw new Error("UI diff 禁止 primary 角色");
    }
  }
}

function preferTextForProfile(profile: PreparationProfile): boolean | undefined {
  if (profile === "text") return true;
  if (profile === "balanced" || profile === "overview") return false;
  return undefined; // infer：交给 image-transform 启发式
}

function resolvedFromPreferText(preferTextUsed: boolean): ResolvedDetailProfile {
  return preferTextUsed ? "text" : "balanced";
}

export class FixedMultiCropPreparation implements ImagePreparationStrategy {
  async prepare(input: PreparationInput): Promise<PreparationOutput> {
    validateItems(input.items, input.items.length === 2 ? "twoImages" : "image");
    const images: PreparedImage[] = [];
    const promptHints: string[] = [];
    const warnings: string[] = [];
    const profiles: ResolvedDetailProfile[] = [];

    if (input.media.length !== input.items.length) {
      throw new Error("内部不变量失败: LoadedMedia 与 MediaItem 数量不一致");
    }

    for (let idx = 0; idx < input.items.length; idx++) {
      const item = input.items[idx];
      const media = input.media[idx];
      const preferText = preferTextForProfile(input.profile);

      if (input.profile === "overview") {
        // 单图不裁剪
        const dataUrl = await encodeBufferToDataUrl(media.buffer, media.mimeType, false);
        images.push({ dataUrl, role: item.role, view: "overview", sourceIndex: idx });
        profiles.push("balanced");
      } else {
        const prepared = await processBufferVariants(media.buffer, media.mimeType, {
          preferText,
          maxTiles: this.budgetFor(input, idx),
        });
        const arr = prepared.variants;
        arr.forEach((dataUrl, i) => {
          images.push({
            dataUrl,
            role: item.role,
            view: i === 0 ? "overview" : "crop",
            sourceIndex: idx,
          });
        });
        if (arr.length > 1) promptHints.push(`[${item.role}] image 1 is the overview; remaining images are detail crops.`);
        profiles.push(resolvedFromPreferText(prepared.preferTextUsed));
      }
    }

    // 合计超 maxImages → 抛不变量错误(不截断)
    if (images.length > input.maxImages) {
      throw new Error(`内部不变量失败:预处理产出 ${images.length} 张超过上限 ${input.maxImages}`);
    }

    const detailProfileUsed = profiles[0]; // 单源取首个;多源(期2 仅 diff)取 expected 的
    return { images, promptHints, detailProfileUsed, warnings };
  }

  private budgetFor(input: PreparationInput, idx: number): number {
    if (input.items.length === 1) return input.maxImages;
    // diff:expected/actual 各留1总览,剩余均分(奇数给 actual)
    if (input.maxImages < 2) return 1;
    const detail = input.maxImages - 2;
    return idx === 0 ? 1 + Math.floor(detail / 2) : 1 + Math.ceil(detail / 2);
  }
}
