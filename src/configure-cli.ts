import { createInterface } from "readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "process";
import { pathToFileURL } from "url";
import {
  createCustomProfileConfig,
  getDefaultUserConfigPath,
  writeUserConfig,
} from "./profile-config.js";

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

async function readPipedAnswers(): Promise<string[] | undefined> {
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

  return lines.length > 0 ? lines : undefined;
}

export async function runConfigureCli(): Promise<void> {
  const pipedAnswers = await readPipedAnswers();
  if (pipedAnswers) {
    const [endpoint, model, apiKey] = pipedAnswers;
    if (!endpoint || !model || !apiKey) {
      throw new Error("Piped configure input must contain endpoint, model, and API key");
    }
    const config = createCustomProfileConfig({ endpoint, model, apiKey });
    const configPath = process.env.VISIONKIT_CONFIG_FILE || getDefaultUserConfigPath();
    writeUserConfig(config, configPath);
    defaultOutput.write(`Saved profile "${model}" to ${configPath}\n`);
    return;
  }

  const rl = createInterface({
    input: defaultInput,
    output: defaultOutput,
  });

  try {
    defaultOutput.write("VisionKit MCP custom model setup\n\n");
    const endpoint = await askRequired(rl, "API endpoint: ");
    const model = await askRequired(rl, "Model name: ");
    const apiKey = await askRequired(rl, "API key: ");

    const config = createCustomProfileConfig({ endpoint, model, apiKey });
    const configPath = process.env.VISIONKIT_CONFIG_FILE || getDefaultUserConfigPath();
    writeUserConfig(config, configPath);

    defaultOutput.write(`\nSaved profile "${model}" to ${configPath}\n`);
    defaultOutput.write("You can now run VisionKit without CUSTOM_* environment variables.\n");
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
