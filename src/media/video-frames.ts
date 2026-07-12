import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { assertPathInAllowedDirs } from "./security.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);

export interface ProcessResult { stdout: string; stderr: string }
export type ProcessRunner = (command: string, args: readonly string[], timeoutMs: number) => Promise<ProcessResult>;

export interface VideoFrameOptions {
  maxSizeMB: number;
  maxDurationSeconds: number;
  maxFrames: number;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export interface ExtractedVideoFrames {
  frames: string[];
  timestamps: number[];
  durationSeconds: number;
  warnings: string[];
}

export interface FrameCandidate {
  buffer: Buffer;
  timestamp: number;
  kind: "uniform" | "scene";
}

interface FrameSignature {
  hash: bigint;
  mean: [number, number, number];
}

export function buildSampleTimestamps(durationSeconds: number, frameCount: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("视频时长无效");
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error("抽帧数量必须为正整数");
  return Array.from({ length: frameCount }, (_, index) =>
    durationSeconds * (index + 0.5) / frameCount
  );
}

export async function selectSmartFrames(
  candidates: readonly FrameCandidate[],
  maxFrames: number
): Promise<{ frames: FrameCandidate[]; duplicatesRemoved: number }> {
  const signed = await Promise.all(candidates.map(async candidate => ({
    candidate,
    signature: await createFrameSignature(candidate.buffer),
  })));
  const sequence = [...signed].sort(byTimestamp);
  const segments: typeof signed = [];
  for (const item of sequence) {
    const previous = segments.at(-1);
    if (!previous || !isSimilar(previous.signature, item.signature)) segments.push(item);
  }
  if (segments.length <= maxFrames) {
    return {
      frames: segments.map(item => item.candidate),
      duplicatesRemoved: candidates.length - segments.length,
    };
  }
  const selected = new Set<typeof signed[number]>();
  const scenes = segments.filter(item => item.candidate.kind === "scene");
  const sceneQuota = Math.min(scenes.length, Math.max(1, Math.floor(maxFrames / 2)));
  chooseEvenly(scenes, sceneQuota).forEach(item => selected.add(item));
  selected.add(segments[0]);
  if (selected.size < maxFrames) selected.add(segments[segments.length - 1]);
  for (const item of chooseEvenly(segments, maxFrames)) {
    if (selected.size >= maxFrames) break;
    selected.add(item);
  }
  for (const item of segments) {
    if (selected.size >= maxFrames) break;
    selected.add(item);
  }
  const frames = [...selected].map(item => item.candidate).sort((a, b) => a.timestamp - b.timestamp);
  return { frames, duplicatesRemoved: candidates.length - frames.length };
}

async function createFrameSignature(buffer: Buffer): Promise<FrameSignature> {
  const { data, info } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  const sums = [0, 0, 0];
  const luminance: number[] = [];
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    sums[0] += r; sums[1] += g; sums[2] += b;
    luminance.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      hash = (hash << 1n) | (luminance[row * 9 + column] > luminance[row * 9 + column + 1] ? 1n : 0n);
    }
  }
  const count = info.width * info.height;
  return { hash, mean: [sums[0] / count, sums[1] / count, sums[2] / count] };
}

function isSimilar(left: FrameSignature, right: FrameSignature): boolean {
  let xor = left.hash ^ right.hash;
  let hamming = 0;
  while (xor) { hamming += Number(xor & 1n); xor >>= 1n; }
  const colorDistance = Math.sqrt(left.mean.reduce((sum, value, index) =>
    sum + Math.pow(value - right.mean[index], 2), 0));
  return hamming <= 6 && colorDistance <= 24;
}

function chooseEvenly<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];
  if (count === 1) return [items[Math.floor(items.length / 2)]];
  return Array.from({ length: count }, (_, index) =>
    items[Math.round(index * (items.length - 1) / (count - 1))]
  );
}

function byTimestamp<T extends { candidate: FrameCandidate }>(a: T, b: T): number {
  return a.candidate.timestamp - b.candidate.timestamp;
}

export const defaultProcessRunner: ProcessRunner = (command, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} 执行超时`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      clearTimeout(timer);
      reject(new Error(`无法启动 ${path.basename(command)}: ${error.message}`));
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} 执行失败 (${code}): ${stderr.trim()}`));
    });
  });

export class VideoFrameExtractor {
  constructor(private readonly runner: ProcessRunner = defaultProcessRunner) {}

  async extract(source: string, options: VideoFrameOptions): Promise<ExtractedVideoFrames> {
    if (/^(?:https?:|data:)/i.test(source)) throw new Error("video_analysis 首版仅支持本地视频文件");
    const resolved = await realpath(path.resolve(source));
    assertPathInAllowedDirs(resolved, [process.cwd(), os.homedir()]);
    if (!VIDEO_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      throw new Error("不支持的视频格式；仅支持 mp4/webm/mov/mkv");
    }
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("视频来源必须是普通文件");
    if (info.size > options.maxSizeMB * 1024 * 1024) throw new Error(`视频超过 ${options.maxSizeMB}MB 上限`);

    const ffprobe = options.ffprobePath || "ffprobe";
    const probe = await this.runner(ffprobe, [
      "-v", "error", "-show_entries", "format=duration", "-of", "json", resolved,
    ], 10_000);
    let duration: number;
    try { duration = Number(JSON.parse(probe.stdout).format?.duration); }
    catch { throw new Error("无法解析 ffprobe 输出"); }
    if (!Number.isFinite(duration!) || duration! <= 0) throw new Error("视频时长无效");
    if (duration! > options.maxDurationSeconds) throw new Error(`视频超过 ${options.maxDurationSeconds} 秒上限`);

    const frameCount = Math.max(1, Math.min(5, options.maxFrames));
    const uniformTimestamps = buildSampleTimestamps(duration!, frameCount);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "visionkit-video-"));
    const candidates: FrameCandidate[] = [];
    const warnings: string[] = [];
    try {
      for (let index = 0; index < uniformTimestamps.length; index += 1) {
        const output = path.join(tempDir, `frame-${index}.jpg`);
        await this.runner(options.ffmpegPath || "ffmpeg", [
          "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", uniformTimestamps[index].toFixed(3),
          "-i", resolved, "-frames:v", "1", "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease",
          "-q:v", "3", "-y", output,
        ], 30_000);
        const buffer = await readFile(output);
        candidates.push({ buffer, timestamp: uniformTimestamps[index], kind: "uniform" });
      }
      try {
        candidates.push(...await this.extractSceneCandidates(resolved, tempDir, options, frameCount * 2));
      } catch (error) {
        warnings.push(`场景检测失败，已回退均匀抽帧: ${error instanceof Error ? error.message : String(error)}`);
      }
      const selected = await selectSmartFrames(candidates, frameCount);
      const frames = selected.frames.map(frame => `data:image/jpeg;base64,${frame.buffer.toString("base64")}`);
      const timestamps = selected.frames.map(frame => frame.timestamp);
      warnings.push(`已分析 ${duration!.toFixed(1)} 秒视频`);
      warnings.push(`智能采样候选 ${candidates.length} 帧，去重/预算移除 ${selected.duplicatesRemoved} 帧，最终保留 ${frames.length} 帧`);
      return { frames, timestamps, durationSeconds: duration!, warnings };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async extractSceneCandidates(
    source: string,
    tempDir: string,
    options: VideoFrameOptions,
    limit: number
  ): Promise<FrameCandidate[]> {
    const pattern = path.join(tempDir, "scene-%03d.jpg");
    const result = await this.runner(options.ffmpegPath || "ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "info", "-i", source,
      "-vf", "select=gt(scene\\,0.30),scale=1280:1280:force_original_aspect_ratio=decrease,showinfo",
      "-fps_mode", "vfr", "-frames:v", String(limit), "-q:v", "3", "-y", pattern,
    ], 30_000);
    const timestamps = [...result.stderr.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g)].map(match => Number(match[1]));
    const files = (await readdir(tempDir)).filter(file => /^scene-\d+\.jpg$/.test(file)).sort();
    const count = Math.min(files.length, timestamps.length, limit);
    return Promise.all(Array.from({ length: count }, async (_, index) => ({
      buffer: await readFile(path.join(tempDir, files[index])),
      timestamp: timestamps[index],
      kind: "scene" as const,
    })));
  }
}
