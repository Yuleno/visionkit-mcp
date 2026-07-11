import type { VisionClient } from "../vision-client.js";
import type { PreparedImage, MediaItem, ResolvedDetailProfile } from "../media/detail-strategy.js";

export interface ExecutionInput {
  images: readonly PreparedImage[];
  systemPrompt: string;
  userPrompt: string;
  thinking?: boolean;
  client: VisionClient;
  rawItems: readonly MediaItem[];
  preparationWarnings: readonly string[];
}

export interface VisionExecutionResult {
  text: string;
  rounds: number;
  warnings: string[];
}

export interface VisionExecutionStrategy {
  execute(input: ExecutionInput): Promise<VisionExecutionResult>;
}

export function composePrompt(images: readonly PreparedImage[], userPrompt: string): string {
  const legend = images
    .map((img, i) => `图${i + 1}: ${img.view === "overview" ? "总览" : "细节裁剪"}(${img.role})`)
    .join(" / ");
  return `${legend}\n\n${userPrompt}`;
}

export class SinglePassExecution implements VisionExecutionStrategy {
  async execute(input: ExecutionInput): Promise<VisionExecutionResult> {
    const dataUrls = input.images.map(i => i.dataUrl);
    const fullUserPrompt = composePrompt(input.images, input.userPrompt);
    const result = await input.client.analyze({
      images: dataUrls,
      systemPrompt: input.systemPrompt,
      userPrompt: fullUserPrompt,
      thinking: input.thinking,
    });
    return {
      text: result.text,
      rounds: 1,
      warnings: [...input.preparationWarnings, ...(result.warnings ?? [])],
    };
  }
}
