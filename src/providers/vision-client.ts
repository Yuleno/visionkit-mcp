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
