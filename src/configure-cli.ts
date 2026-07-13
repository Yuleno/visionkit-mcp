import { createInterface } from "readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "process";
import { pathToFileURL } from "url";

interface ConfigureAnswers {
  endpoint: string;
  model: string;
  apiKey: string;
}

function normalizeEndpointUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

/** 打印一段可直接粘贴到 MCP 客户端的 stdio 配置片段；key 用占位符，真实 key 不进 stdout。 */
function printConfigSnippet(endpoint: string, model: string): void {
  const snippet = {
    mcpServers: {
      "visionkit-mcp": {
        type: "stdio",
        command: "npx",
        args: ["-y", "github:Juvorix/visionkit-mcp"],
        env: {
          VISIONKIT_API_KEY: "<在此粘贴你的 API key>",
          VISIONKIT_BASE_URL: endpoint,
          VISIONKIT_MODEL: model,
        },
      },
    },
  };
  defaultOutput.write("\n把以下片段粘贴到你的 MCP 客户端配置：\n\n");
  defaultOutput.write(JSON.stringify(snippet, null, 2));
  defaultOutput.write("\n\n已读取你的 endpoint 与 model；API key 请在粘贴到客户端后手动填入，不要提交到版本控制。\n");
}

async function askRequired(
  rl: ReturnType<typeof createInterface>,
  question: string
): Promise<string> {
  const answer = (await rl.question(question)).trim();
  if (!answer) {
    throw new Error(`${question.replace(/[:：]\s*$/, "")} cannot be empty`);
  }
  return answer;
}

async function readPipedAnswers(): Promise<ConfigureAnswers | undefined> {
  if (defaultInput.isTTY) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of defaultInput) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const lines = Buffer.concat(chunks)
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    return undefined;
  }
  const [endpoint, model, apiKey] = lines;
  return { endpoint, model, apiKey };
}

function validate(answers: ConfigureAnswers): { endpoint: string; model: string; apiKey: string } {
  const endpoint = normalizeEndpointUrl(answers.endpoint);
  const model = answers.model.trim();
  const apiKey = answers.apiKey.trim();
  if (!endpoint) throw new Error("API endpoint cannot be empty");
  if (!model) throw new Error("Model name cannot be empty");
  if (!apiKey) throw new Error("API key cannot be empty");
  return { endpoint, model, apiKey };
}

export async function runConfigureCli(): Promise<void> {
  const piped = await readPipedAnswers();
  if (piped) {
    // piped 模式仍要求三项齐全以保持契约，但输出片段里 key 只用占位符
    const { endpoint, model } = validate(piped);
    printConfigSnippet(endpoint, model);
    return;
  }

  const rl = createInterface({ input: defaultInput, output: defaultOutput });
  try {
    defaultOutput.write("VisionKit MCP custom model setup\n");
    defaultOutput.write("本命令只打印配置片段，不会保存任何文件，也不会把 API key 打到屏幕。\n\n");
    const endpoint = await askRequired(rl, "API endpoint: ");
    const model = await askRequired(rl, "Model name: ");
    const apiKey = await askRequired(rl, "API key: ");
    const valid = validate({ endpoint, model, apiKey });
    printConfigSnippet(valid.endpoint, valid.model);
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConfigureCli().catch((error) => {
    process.stderr.write(
      `Configuration failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}
