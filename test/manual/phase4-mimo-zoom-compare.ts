/** 期4真实对照：同一密集截图分别关闭/开启 Agentic Zoom。会产生 API 消耗。 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { loadConfig } from "../../src/config.js";
import { createClient } from "../../src/providers/registry.js";
import { makeHandler } from "../../src/tools/handler.js";
import { TOOL_DEFS } from "../../src/tools/definitions.js";
import type { VisionClient } from "../../src/providers/vision-client.js";
import { VERSION } from "../../src/version.js";

const synthetic = process.argv.includes("--synthetic");
const image = path.resolve(synthetic ? ".visionkit-mcp/phase4-zoom-synthetic.png" : (process.argv[2] || "imageTest/deepswe.png"));
const prompt = synthetic
  ? "请准确读取右下角 Details 面板中 Verification Code 后面的完整值。若当前图片不能让你完全确认每个字符，请请求 zoom；不要猜测。只输出验证码。"
  : "请尽可能完整、准确地提取图片中所有可见文字，保留阅读顺序和表格结构";
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

async function run(enabled: boolean) {
  const client = new Client({ name: `visionkit-phase4-${enabled ? "on" : "off"}`, version: VERSION });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env: { ...baseEnv, VISIONKIT_ENABLE_AGENTIC_ZOOM: String(enabled), VISIONKIT_MAX_ZOOM_ROUNDS: "1" },
  });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: "extract_text_from_screenshot",
      arguments: { image_source: image, prompt },
    });
    if (result.isError) throw new Error(`MCP 返回错误: ${JSON.stringify(result.content)}`);
    const data = result.structuredContent as { text: string; rounds: number; warnings: string[] };
    if (!data || typeof data.text !== "string") throw new Error("缺少 structuredContent");
    return data;
  } finally {
    await client.close();
  }
}

async function createSyntheticFixture() {
  await mkdir(path.dirname(image), { recursive: true });
  const panels = Array.from({ length: 36 }, (_, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const x = 120 + col * 630;
    const y = 180 + row * 610;
    return `<rect x="${x}" y="${y}" width="560" height="520" rx="24" fill="#111827" stroke="#334155" stroke-width="4"/>
      <text x="${x + 28}" y="${y + 52}" font-size="28" fill="#94a3b8">Metric ${String(index + 1).padStart(2, "0")}</text>
      <text x="${x + 28}" y="${y + 135}" font-size="62" fill="#e2e8f0">${(index * 7.31 + 12.4).toFixed(2)}</text>
      <path d="M ${x + 30} ${y + 430} C ${x + 150} ${y + 260}, ${x + 300} ${y + 490}, ${x + 520} ${y + 230}" fill="none" stroke="#38bdf8" stroke-width="10"/>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="4000">
    <rect width="4000" height="4000" fill="#020617"/>
    <text x="120" y="105" font-family="Arial" font-size="64" fill="#f8fafc">Synthetic Operations Dashboard</text>
    ${panels}
    <rect x="3260" y="3460" width="610" height="390" rx="18" fill="#0f172a" stroke="#f59e0b" stroke-width="5"/>
    <text x="3300" y="3520" font-family="Arial" font-size="30" fill="#fbbf24">Details</text>
    <text x="3300" y="3590" font-family="Arial" font-size="22" fill="#94a3b8">Region: southeast-cluster</text>
    <text x="3300" y="3650" font-family="Arial" font-size="22" fill="#94a3b8">Status: requires close inspection</text>
    <text x="3300" y="3740" font-family="Arial" font-size="13" fill="#ffffff">Verification Code: VK7Q-29MX-4P8R</text>
    <text x="3300" y="3790" font-family="Arial" font-size="13" fill="#64748b">Control Code: VK7Q-29NX-4PBR</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(image);
}

async function runForcedZoom() {
  const config = loadConfig();
  config.agenticZoom = { enabled: true, maxZoomRounds: 1 };
  const realClient = createClient(config);
  let calls = 0;
  const client: VisionClient = {
    name: realClient.name,
    model: realClient.model,
    capabilities: realClient.capabilities,
    analyze: async request => {
      calls += 1;
      if (calls === 1) {
        return { text: '{"action":"zoom","cells":[{"row":2,"column":2,"reason":"manual live crop verification"}]}' };
      }
      return realClient.analyze(request);
    },
    getModelName: () => realClient.getModelName(),
  };
  const def = TOOL_DEFS.find(item => item.name === "extract_text_from_screenshot")!;
  const handler = makeHandler(def, client, config, { maxImages: Math.min(5, client.capabilities.maxImages) });
  const result = await handler({ image_source: image, prompt }) as any;
  if (result.isError) throw new Error(`Forced Zoom 返回错误: ${JSON.stringify(result.content)}`);
  return result.structuredContent as { text: string; rounds: number; warnings: string[] };
}

if (synthetic) await createSyntheticFixture();
if (process.argv.includes("--generate-only")) {
  process.stdout.write(`${image}\n`);
  process.exit(0);
}
if (process.argv.includes("--forced-only")) {
  const forced = await runForcedZoom();
  process.stdout.write(JSON.stringify({ image, forced }, null, 2));
  process.exit(0);
}

const baseline = await run(false);
const zoom = await run(true);
process.stdout.write(JSON.stringify({
  image,
  baseline: { rounds: baseline.rounds, warnings: baseline.warnings, text: baseline.text },
  zoom: { rounds: zoom.rounds, warnings: zoom.warnings, text: zoom.text },
}, null, 2));
