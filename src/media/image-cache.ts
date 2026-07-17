import { createHash } from "node:crypto";

export class LruCache<K, V> {
  private readonly values = new Map<K, V>();

  constructor(private readonly maxSize = 100) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error("LRU cache size must be a positive integer");
    }
  }

  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value !== undefined) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.values.has(key)) {
      this.values.delete(key);
    } else if (this.values.size >= this.maxSize) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

export function makeImageCacheKey(source: string, options: unknown, isDataUri: boolean): string {
  const serializedOptions = JSON.stringify(options ?? {});
  if (source.length <= 256 && !isDataUri) {
    return `${source}::${serializedOptions}`;
  }
  return `sha256:${createHash("sha256").update(source).update(serializedOptions).digest("hex")}`;
}
