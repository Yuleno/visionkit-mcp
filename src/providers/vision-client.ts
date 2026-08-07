/** Provider 层对工具层公开的稳定契约。 */

export interface Capabilities {
  maxImages: number;
  nativeVideo: boolean;
  toolCalling: boolean;
  grounding: boolean;
  systemPromptMode: "native" | "merge_user";
}

export interface VisionRequest {
  images: readonly string[];
  systemPrompt?: string;
  userPrompt: string;
  thinking?: boolean;
}

export interface VisionResult {
  text: string;
  warnings?: string[];
}

export interface VisionClient {
  readonly name: string;
  readonly model: string;
  readonly capabilities: Capabilities;
  analyze(request: VisionRequest): Promise<VisionResult>;
  getModelName(): string;
}

export function buildImageContent(images: readonly string[]) {
  return images.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
}

const ANTHROPIC_DATA_URI_PATTERN = /^data:([^;]+);base64,(.+)$/s;

/**
 * 把图片源（Data URI 或 http(s) URL）解析成 Anthropic Messages 的 image 内容块。
 *
 * - Data URI: `data:image/png;base64,...` → {type:"image", source:{type:"base64", media_type, data}}
 * - http(s) URL: → {type:"image", source:{type:"url", url}}
 *
 * Data URI 形态的 media_type 必须是 Anthropic 支持的 image/jpeg|png|webp|gif。
 */
export function buildAnthropicImageContent(images: readonly string[]) {
  return images.map((source) => {
    const match = source.match(ANTHROPIC_DATA_URI_PATTERN);
    if (match) {
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: match[1], data: match[2] },
      };
    }
    return {
      type: "image" as const,
      source: { type: "url" as const, url: source },
    };
  });
}
