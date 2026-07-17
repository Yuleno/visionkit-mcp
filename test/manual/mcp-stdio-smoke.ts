import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { VERSION } from "../../src/version.js";

async function main(): Promise<void> {
  const client = new Client({ name: "visionkit-package-smoke", version: VERSION });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VISIONKIT_API_KEY: "smoke-test-key",
      VISIONKIT_BASE_URL: "https://example.test/v1",
      VISIONKIT_MODEL: "mimo-v2.5",
    },
  });

  await client.connect(transport);
  try {
    const serverVersion = client.getServerVersion();
    if (serverVersion?.version !== VERSION) {
      throw new Error(`服务版本不一致：${serverVersion?.version ?? "missing"} != ${VERSION}`);
    }
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const expected of ["image_analysis", "ui_diff_check", "video_analysis"]) {
      if (!names.has(expected)) throw new Error(`tools/list 缺少 ${expected}`);
    }
    process.stdout.write(`MCP stdio smoke passed (${VERSION}, ${listed.tools.length} tools)\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`MCP stdio smoke failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
