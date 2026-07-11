import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

export function buildSampleTimestamps(durationSeconds: number, frameCount: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("视频时长无效");
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error("抽帧数量必须为正整数");
  return Array.from({ length: frameCount }, (_, index) =>
    durationSeconds * (index + 0.5) / frameCount
  );
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
    const timestamps = buildSampleTimestamps(duration!, frameCount);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "visionkit-video-"));
    const frames: string[] = [];
    try {
      for (let index = 0; index < timestamps.length; index += 1) {
        const output = path.join(tempDir, `frame-${index}.jpg`);
        await this.runner(options.ffmpegPath || "ffmpeg", [
          "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", timestamps[index].toFixed(3),
          "-i", resolved, "-frames:v", "1", "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease",
          "-q:v", "3", "-y", output,
        ], 30_000);
        const buffer = await readFile(output);
        frames.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    return {
      frames,
      timestamps,
      durationSeconds: duration!,
      warnings: [`已从 ${duration!.toFixed(1)} 秒视频均匀抽取 ${frames.length} 帧`],
    };
  }
}
