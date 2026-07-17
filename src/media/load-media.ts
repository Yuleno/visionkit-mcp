import { loadValidatedImageBuffer } from "./image-source.js";
import type { MediaItem } from "./detail-strategy.js";

export interface LoadedMedia {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  role: MediaItem["role"];
  sourceIndex: number;
}

export interface MediaLoader {
  load(items: readonly MediaItem[]): Promise<LoadedMedia[]>;
}

export class DefaultMediaLoader implements MediaLoader {
  async load(items: readonly MediaItem[]): Promise<LoadedMedia[]> {
    return Promise.all(items.map(async (item, sourceIndex) => {
      const loaded = await loadValidatedImageBuffer(item.source);
      return { ...loaded, role: item.role, sourceIndex };
    }));
  }
}
