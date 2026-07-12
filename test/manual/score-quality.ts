import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { scoreQualityManifest, type QualityManifest, type QualityResult } from "../../src/quality/scorer.js";

interface ComparisonReport {
  visionkit?: { reports?: Record<string, { text?: string; elapsedMs?: number; structuredContent?: { rounds?: number } }> };
  zaiOfficial?: { reports?: Record<string, { text?: string; elapsedMs?: number; structuredContent?: { rounds?: number } }> };
}

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, "test/quality/quality-manifest.json"), "utf8")) as QualityManifest;
const reports = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [".visionkit-mcp/zai-vision-comparison.json", ".visionkit-mcp/zai-vision-comparison-ui_diff.json"];

function collect(side: "visionkit" | "zaiOfficial"): Record<string, QualityResult> {
  const results: Record<string, QualityResult> = {};
  for (const relativePath of reports) {
    const filePath = path.resolve(root, relativePath);
    if (!existsSync(filePath)) continue;
    const report = JSON.parse(readFileSync(filePath, "utf8")) as ComparisonReport;
    for (const [id, value] of Object.entries(report[side]?.reports ?? {})) {
      if (typeof value.text !== "string") continue;
      results[id] = { text: value.text, elapsedMs: value.elapsedMs, rounds: value.structuredContent?.rounds };
    }
  }
  return results;
}

function summarize(scores: ReturnType<typeof scoreQualityManifest>) {
  const count = scores.length;
  return {
    cases: count,
    averageFactRecall: count === 0 ? 0 : scores.reduce((sum, score) => sum + score.factRecall, 0) / count,
    unsupportedClaims: scores.reduce((sum, score) => sum + score.unsupportedClaims.length, 0),
    formatCompliant: scores.filter(score => score.formatCompliant).length,
  };
}

const visionkit = scoreQualityManifest(manifest, collect("visionkit"));
const zaiOfficial = scoreQualityManifest(manifest, collect("zaiOfficial"));
process.stdout.write(`${JSON.stringify({
  manifestVersion: manifest.version,
  visionkit: { summary: summarize(visionkit), scores: visionkit },
  zaiOfficial: { summary: summarize(zaiOfficial), scores: zaiOfficial },
}, null, 2)}\n`);
