/**
 * 使用同一组本地样本，对比 VisionKit（当前 connection profile）与 Z.AI 官方 Vision MCP。
 * 会消耗两侧 API/套餐额度；密钥优先从环境变量读取，绝不输出。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface McpConfig {
  mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
}

interface ComparisonCase {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

interface CallReport {
  elapsedMs: number;
  isError: boolean;
  text: string;
  structuredContent?: unknown;
}

const root = process.cwd();
const zaiMcpPackage = "@z_ai/mcp-server@0.1.2";
const image = (name: string) => path.resolve(root, "imageTest", name);
const cases: ComparisonCase[] = [
  {
    id: "ocr",
    name: "extract_text_from_screenshot",
    arguments: { image_source: image("deepswe.png"), prompt: "尽可能完整、准确地提取所有可见文字，保留阅读顺序和表格结构。" },
  },
  {
    id: "technical_diagram",
    name: "understand_technical_diagram",
    arguments: { image_source: image("validation-architecture.png"), prompt: "列出所有节点、连线方向和每条连线标签，说明完整请求流程。" },
  },
  {
    id: "error_diagnosis",
    name: "diagnose_error_screenshot",
    arguments: { image_source: image("validation-error.png"), prompt: "逐字提取错误、精确定位代码位置，并给出最小修复方案。" },
  },
  {
    id: "ui_diff",
    name: "ui_diff_check",
    arguments: {
      expected_image_source: image("validation-ui-expected.png"),
      actual_image_source: image("validation-ui-actual.png"),
      prompt: "列出所有可观察到的视觉差异，包括布局、尺寸、颜色、圆角、间距和按钮位置。",
    },
  },
];

function textFromResult(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: string; text?: string } =>
      typeof item === "object" && item !== null && "type" in item && typeof (item as { type?: unknown }).type === "string"
    )
    .filter(item => item.type === "text")
    .map(item => item.text ?? "")
    .join("\n");
}

async function runServer(
  label: string,
  options: ConstructorParameters<typeof StdioClientTransport>[0],
  selectedCases: readonly ComparisonCase[]
) {
  const client = new Client({ name: `visionkit-compare-${label}`, version: "1.0.0" });
  const transport = new StdioClientTransport(options);
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const reports: Record<string, CallReport> = {};
    for (const testCase of selectedCases) {
      const started = performance.now();
      try {
        const result = await client.callTool(
          { name: testCase.name, arguments: testCase.arguments },
          undefined,
          { timeout: 120_000 }
        );
        reports[testCase.id] = {
          elapsedMs: Math.round(performance.now() - started),
          isError: result.isError === true,
          text: textFromResult(result),
          structuredContent: result.structuredContent,
        };
      } catch (error) {
        reports[testCase.id] = {
          elapsedMs: Math.round(performance.now() - started),
          isError: true,
          text: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { tools: tools.tools.map(tool => tool.name).sort(), reports };
  } finally {
    await client.close();
  }
}

async function main() {
  let localEnv: Record<string, string> = {};
  try {
    const config = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8")) as McpConfig;
    localEnv = config.mcpServers?.["zai-mcp-server"]?.env ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const zaiEnv = {
    ...localEnv,
    ...(process.env.Z_AI_API_KEY ? { Z_AI_API_KEY: process.env.Z_AI_API_KEY } : {}),
    ...(process.env.Z_AI_MODE ? { Z_AI_MODE: process.env.Z_AI_MODE } : {}),
  };
  if (!zaiEnv.Z_AI_API_KEY) {
    throw new Error("缺少 Z_AI_API_KEY：请设置环境变量，或在已忽略的本地 .mcp.json 中配置");
  }

  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  const caseFilter = process.argv.find(arg => arg.startsWith("--case="))?.slice("--case=".length);
  const selectedCases = caseFilter ? cases.filter(testCase => testCase.id === caseFilter) : cases;
  if (selectedCases.length === 0) throw new Error(`未知对比样本：${caseFilter}`);
  const officialCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const report = {
    generatedAt: new Date().toISOString(),
    cases: selectedCases.map(({ id, name }) => ({ id, name })),
    visionkit: await runServer("visionkit", {
      command: process.execPath,
      args: ["build/index.js"],
      cwd: root,
      env: inheritedEnv,
    }, selectedCases),
    zaiOfficial: await runServer("zai-official", {
      command: officialCommand,
      args: ["-y", zaiMcpPackage],
      cwd: root,
      env: { ...inheritedEnv, ...zaiEnv },
    }, selectedCases),
  };
  const outputDir = path.join(root, ".visionkit-mcp");
  const outputPath = path.join(outputDir, `zai-vision-comparison${caseFilter ? `-${caseFilter}` : ""}.json`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const summary = Object.fromEntries(
    Object.entries(report.visionkit.reports).map(([id, result]) => [id, {
      visionkit: { elapsedMs: result.elapsedMs, isError: result.isError },
      zaiOfficial: { elapsedMs: report.zaiOfficial.reports[id].elapsedMs, isError: report.zaiOfficial.reports[id].isError },
    }])
  );
  process.stdout.write(`${JSON.stringify({ outputPath, visionkitTools: report.visionkit.tools, zaiOfficialTools: report.zaiOfficial.tools, summary }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`MCP 对比失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
