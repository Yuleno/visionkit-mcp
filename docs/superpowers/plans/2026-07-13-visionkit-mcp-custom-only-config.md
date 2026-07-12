# VisionKit MCP custom-only 配置收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 VisionKit 的产品入口从"多 provider + 项目内配置文件"收敛为"custom-only + 统一 env"，标准 MCP 客户端用一段 `mcpServers / stdio / npx / env` 即可安装。

**Architecture:** 配置层 `config.ts` 收口为 custom-only，`MODEL_PROVIDER` 保留解析作迁移守卫；provider 注册表 `registry.ts` 只暴露 custom；新增 `normalizeEndpoint()` 同时归一化 baseURL 与 requestPath，解决用户填完整 URL 的拼接问题；`configure` 改为打印配置片段不落盘；内置 5 家薄子类作为 dormant 保留打标；根目录 re-export shim 先迁 import 再删。

**Tech Stack:** TypeScript（ESM + Node >= 22.12）、`@modelcontextprotocol/sdk`、axios、zod、vitest。PowerShell 为本机主 shell。

**Spec:** `docs/superpowers/specs/2026-07-13-visionkit-mcp-custom-only-config-design.md`

**关键事实（已核实，写代码时以此为准）：**

- 根目录 `vision-client.ts` shim 被 **5 处** import（非 spec 旧文说的 3 处）：`src/tools/execution-strategy.ts:1`、`src/tools/handler.ts:2`、`src/tools/video-handler.ts:2`、`test/manual/phase4-mimo-zoom-compare.ts:11`，以及经 test-local 间接。迁移这 4 处 + test-local 后才能删 shim。
- 根目录 `client-registry.ts` shim 被 `test/test-local.ts:11` import。
- `src/index.ts` 直接 `import { createClient } from "./providers/registry.js"`，不依赖任何 shim。
- 6 家 provider 的 transport 全是 `{ baseUrl, requestPath, timeoutMs, headers }`，统一 `Authorization: Bearer` 后 custom 与内置 5 家鉴权头一致。

---

## 文件结构

**新增：**
- `src/providers/request-path.ts` — 导出 `normalizeEndpoint(baseUrl) → { baseURL, requestPath }`，纯函数，单一职责。
- `test/unit/request-path.test.ts` — 覆盖 `normalizeEndpoint` 正反例与完整 URL 拆分。

**修改：**
- `src/config.ts` — custom-only 收敛 + MODEL_PROVIDER 守卫 + CustomProviderConfig 类型瘦身。
- `src/providers/registry.ts` — 只注册 custom。
- `src/providers/custom-client.ts` — 统一 Bearer + normalizeEndpoint + thinking 简化。
- `src/configure-cli.ts` — 重写为打印配置片段。
- `src/tools/execution-strategy.ts`、`src/tools/handler.ts`、`src/tools/video-handler.ts` — import 路径迁移到 providers。
- `test/manual/phase4-mimo-zoom-compare.ts`、`test/test-local.ts` — shim import 迁移。
- `test/unit/provider-contract.test.ts` — custom 用例更新为三字段 + Bearer。
- `src/providers/{zhipu,siliconflow,qwen,volcengine,hunyuan}-client.ts` — 顶部加 dormant 注释。
- `src/providers/capabilities.ts` — 删 siliconflow 条目。
- `README.md`、`docs/STATUS.md`、`AGENTS.md` — 文档同步。

**删除：**
- `src/profile-config.ts`
- `src/vision-client.ts`、`src/custom-client.ts`、`src/zhipu-client.ts`、`src/siliconflow-client.ts`、`src/qwen-client.ts`、`src/volcengine-client.ts`、`src/hunyuan-client.ts`、`src/client-registry.ts`（根目录 shim）
- `test/unit/profile-config.test.ts`、`test/unit/config-profile.test.ts`、`test/test-custom.ts`

---

## Task 1: 新增 normalizeEndpoint 纯函数（TDD）

**Files:**
- Create: `src/providers/request-path.ts`
- Test: `test/unit/request-path.test.ts`

- [ ] **Step 1: 写失败测试**

Create `test/unit/request-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeEndpoint } from "../../src/providers/request-path.js";

describe("normalizeEndpoint", () => {
  it("base URL 不含 /chat/completions 时补上 requestPath", () => {
    expect(normalizeEndpoint("https://api.example.com/v1")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("base URL 已含 /chat/completions 时拆分，避免拼接重复", () => {
    expect(normalizeEndpoint("https://api.example.com/v1/chat/completions")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("忽略 /chat/completions 的尾斜杠", () => {
    expect(normalizeEndpoint("https://api.example.com/v1/chat/completions/")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("去掉 baseURL 尾部多余斜杠", () => {
    expect(normalizeEndpoint("https://api.example.com/v1///")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("无版本前缀的 base URL 也能补 requestPath", () => {
    expect(normalizeEndpoint("https://api.example.com")).toEqual({
      baseURL: "https://api.example.com",
      requestPath: "/chat/completions",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:unit -- request-path`
Expected: FAIL，`normalizeEndpoint` 未定义 / 模块找不到。

- [ ] **Step 3: 写最小实现**

Create `src/providers/request-path.ts`:

```ts
/**
 * 把用户填写的 base URL 归一化为 { baseURL, requestPath }。
 *
 * axios 请求 URL = baseURL + requestPath。若用户把完整 URL
 * .../v1/chat/completions 当作 base，直接固定 requestPath=/chat/completions
 * 会拼成 .../v1/chat/completions/chat/completions 导致 404。
 * 因此当 base 已含 /chat/completions 时拆出前缀作为 baseURL。
 */
export interface NormalizedEndpoint {
  baseURL: string;
  requestPath: string;
}

const CHAT_COMPLETIONS = "/chat/completions";

export function normalizeEndpoint(rawBaseUrl: string): NormalizedEndpoint {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, "");
  const suffix = CHAT_COMPLETIONS;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
    return { baseURL: trimmed.slice(0, -suffix.length).replace(/\/+$/, ""), requestPath: suffix };
  }
  return { baseURL: trimmed, requestPath: suffix };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:unit -- request-path`
Expected: PASS，5 个用例全绿。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 6: commit**

```bash
git add src/providers/request-path.ts test/unit/request-path.test.ts
git commit -m "feat: 增加 normalizeEndpoint 归一化 base URL 与 requestPath"
```

---

## Task 2: config.ts 收敛为 custom-only + MODEL_PROVIDER 守卫

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: 替换 provider 类型与配置加载逻辑**

把 `src/config.ts` 整体替换为（保留文件顶部注释语义）：

```ts
/**
 * 配置模块
 * custom-only：从 VISIONKIT_* 环境变量加载配置
 */

import { z } from "zod";

export interface CustomProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface VisionKitConfig {
  provider: "custom";
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  enableThinking: boolean;
  multiCrop: boolean;
  multiCropMaxTiles: number;
  baseVisionPrompt?: string;
  customProvider: CustomProviderConfig;
  capabilityOverrides?: CapabilityOverrides;
  agenticZoom?: { enabled: boolean; maxZoomRounds: 1 };
  video?: {
    maxSizeMB: number;
    maxDurationSeconds: number;
    maxFrames: number;
    ffmpegPath?: string;
    ffprobePath?: string;
  };
}

export interface CapabilityOverrides {
  maxImages?: number;
  nativeVideo?: boolean;
  toolCalling?: boolean;
  grounding?: boolean;
  systemPromptMode?: "native" | "merge_user";
}

const EnvBoolean = z.enum(["true", "false", "1", "0"]).transform(
  (value) => value === "true" || value === "1"
);

const CapabilityOverridesSchema = z.object({
  maxImages: z.coerce.number().int().positive().optional(),
  nativeVideo: EnvBoolean.optional(),
  toolCalling: EnvBoolean.optional(),
  grounding: EnvBoolean.optional(),
  systemPromptMode: z.enum(["native", "merge_user"]).optional(),
});

const AgenticZoomSchema = z.object({
  enabled: EnvBoolean.default("false"),
  maxZoomRounds: z.coerce.number().int().refine(value => value === 1, "首版仅支持 1 轮 Zoom").default(1),
});

const VideoConfigSchema = z.object({
  maxSizeMB: z.coerce.number().positive().max(100).default(100),
  maxDurationSeconds: z.coerce.number().positive().max(120).default(120),
  maxFrames: z.coerce.number().int().min(2).max(5).default(5),
  ffmpegPath: z.string().min(1).optional(),
  ffprobePath: z.string().min(1).optional(),
});

function loadCapabilityOverrides(env: NodeJS.ProcessEnv): CapabilityOverrides {
  const parsed = CapabilityOverridesSchema.parse({
    maxImages: env.VISIONKIT_MAX_IMAGES,
    nativeVideo: env.VISIONKIT_NATIVE_VIDEO,
    toolCalling: env.VISIONKIT_TOOL_CALLING,
    grounding: env.VISIONKIT_GROUNDING,
    systemPromptMode: env.VISIONKIT_SYSTEM_PROMPT_MODE,
  });
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined)
  ) as CapabilityOverrides;
}

/**
 * 从环境变量加载配置（custom-only）
 */
export function loadConfig(): VisionKitConfig {
  const capabilityOverrides = loadCapabilityOverrides(process.env);
  const agenticZoom = AgenticZoomSchema.parse({
    enabled: process.env.VISIONKIT_ENABLE_AGENTIC_ZOOM,
    maxZoomRounds: process.env.VISIONKIT_MAX_ZOOM_ROUNDS,
  }) as { enabled: boolean; maxZoomRounds: 1 };
  const video = VideoConfigSchema.parse({
    maxSizeMB: process.env.VISIONKIT_VIDEO_MAX_MB,
    maxDurationSeconds: process.env.VISIONKIT_VIDEO_MAX_SECONDS,
    maxFrames: process.env.VISIONKIT_VIDEO_MAX_FRAMES,
    ffmpegPath: process.env.VISIONKIT_FFMPEG_PATH,
    ffprobePath: process.env.VISIONKIT_FFPROBE_PATH,
  });

  // 迁移守卫：显式设置非 custom 的 MODEL_PROVIDER 时给出明确迁移指引
  const modelProvider = process.env.MODEL_PROVIDER?.toLowerCase().trim();
  if (modelProvider && modelProvider !== "custom") {
    throw new Error(
      `MODEL_PROVIDER=${modelProvider} is no longer supported. VisionKit is now custom-only. ` +
        `Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL instead. See README migration notes.`
    );
  }

  const apiKey = process.env.VISIONKIT_API_KEY?.trim();
  const baseUrl = process.env.VISIONKIT_BASE_URL?.trim();
  const model = process.env.VISIONKIT_MODEL?.trim();

  if (!apiKey) {
    throw new Error("VISIONKIT_API_KEY is required. Set it in your MCP client env.");
  }
  if (!baseUrl) {
    throw new Error("VISIONKIT_BASE_URL is required (e.g. https://your-provider.example/v1).");
  }
  if (!model) {
    throw new Error("VISIONKIT_MODEL is required (e.g. your-model-name).");
  }

  return {
    provider: "custom",
    apiKey,
    model,
    maxTokens: parseInt(process.env.MAX_TOKENS || "8192", 10),
    temperature: parseFloat(process.env.TEMPERATURE || "0.7"),
    topP: parseFloat(process.env.TOP_P || "0.95"),
    enableThinking: process.env.ENABLE_THINKING !== "false",
    multiCrop: process.env.MULTI_CROP !== "false",
    multiCropMaxTiles: parseInt(process.env.MULTI_CROP_MAX_TILES || "5", 10),
    baseVisionPrompt: process.env.BASE_VISION_PROMPT,
    customProvider: { apiKey, baseUrl, model },
    capabilityOverrides,
    agenticZoom,
    video,
  };
}
```

- [ ] **Step 2: typecheck（此时会有下游报错：custom-client / provider-contract / profile-config 等，属预期）**

Run: `npm run typecheck`
Expected: 报错集中在 `CustomProviderConfig` 字段缺失引用与 profile-config 相关。记录报错文件清单，后续 Task 逐个消除。

- [ ] **Step 3: commit（config 收敛，下游尚未全绿）**

```bash
git add src/config.ts
git commit -m "feat: config 收敛为 custom-only 并增加 MODEL_PROVIDER 迁移守卫"
```

---

## Task 3: custom-client.ts 统一 Bearer + normalizeEndpoint

**Files:**
- Modify: `src/providers/custom-client.ts`

- [ ] **Step 1: 重写 custom-client**

把 `src/providers/custom-client.ts` 整体替换为：

```ts
import type { VisionKitConfig } from "../config.js";
import { resolveCapabilities } from "./capabilities.js";
import { BaseVisionClient, type HttpClientFactory, type TransportConfig } from "./base-client.js";
import { normalizeEndpoint } from "./request-path.js";

const CUSTOM_TIMEOUT_MS = 60_000;

export class CustomClient extends BaseVisionClient {
  readonly name = "Custom";

  constructor(config: VisionKitConfig, httpFactory?: HttpClientFactory) {
    if (!config.customProvider) {
      throw new Error(
        "CustomClient requires customProvider configuration. Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL environment variables."
      );
    }
    const { baseURL, requestPath } = normalizeEndpoint(config.customProvider.baseUrl);
    const transport: TransportConfig = {
      baseUrl: baseURL,
      requestPath,
      timeoutMs: CUSTOM_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.customProvider.apiKey}`,
      },
    };
    super(
      config,
      transport,
      resolveCapabilities("custom", config.customProvider.model, config.capabilityOverrides),
      httpFactory
    );
  }

  protected applyThinking(_body: Record<string, unknown>, thinking: boolean | undefined): string[] {
    return thinking === true ? ["Custom provider 未配置 thinking 支持，已忽略"] : [];
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: custom-client 报错消除；剩余报错集中在 provider-contract 测试与 profile-config 引用。

- [ ] **Step 3: commit**

```bash
git add src/providers/custom-client.ts
git commit -m "feat: custom client 统一 Bearer 鉴权并用 normalizeEndpoint 解析 path"
```

---

## Task 4: registry.ts 收口到 custom

**Files:**
- Modify: `src/providers/registry.ts`

- [ ] **Step 1: 重写 registry**

把 `src/providers/registry.ts` 整体替换为：

```ts
import type { VisionKitConfig } from "../config.js";
import { CustomClient } from "./custom-client.js";
import type { VisionClient } from "./vision-client.js";

/**
 * custom-only：注册表只暴露 custom。
 * 内置五家薄子类（zhipu/siliconflow/qwen/volcengine/hunyuan）保留为 dormant，
 * 见各文件顶部注释与 AGENTS.md，未来建立 live-probe 兼容性矩阵后再恢复。
 */
export const CLIENT_REGISTRY: Record<string, (config: VisionKitConfig) => VisionClient> = {
  custom: (config) => new CustomClient(config),
};

export function createClient(config: VisionKitConfig): VisionClient {
  const factory = CLIENT_REGISTRY[config.provider];
  if (!factory) {
    throw new Error(
      `Unsupported provider: ${config.provider}. VisionKit is custom-only; set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL. See README migration notes.`
    );
  }
  return factory(config);
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: registry 报错消除。

- [ ] **Step 3: commit**

```bash
git add src/providers/registry.ts
git commit -m "feat: provider 注册表收口为 custom-only"
```

---

## Task 5: 删除 profile-config.ts 及其测试

**Files:**
- Delete: `src/profile-config.ts`, `test/unit/profile-config.test.ts`, `test/unit/config-profile.test.ts`

- [ ] **Step 1: 删除文件**

Run:
```bash
git rm src/profile-config.ts test/unit/profile-config.test.ts test/unit/config-profile.test.ts
```

- [ ] **Step 2: typecheck（configure-cli 此时仍 import 已删模块，预期报错）**

Run: `npm run typecheck`
Expected: 报错集中在 `src/configure-cli.ts` 的 `createCustomProfileConfig / writeUserConfig / getDefaultUserConfigPath` import。下一 Task 消除。

- [ ] **Step 3: commit**

```bash
git commit -m "refactor: 删除 profile-config 与连接 profile 概念"
```

---

## Task 6: configure-cli.ts 重写为打印配置片段

**Files:**
- Modify: `src/configure-cli.ts`

- [ ] **Step 1: 重写 configure-cli**

把 `src/configure-cli.ts` 整体替换为：

```ts
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
        args: ["-y", "visionkit-mcp"],
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
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: configure-cli 报错消除。

- [ ] **Step 3: commit**

```bash
git add src/configure-cli.ts
git commit -m "feat: configure 改为打印 stdio 配置片段，不落盘且 key 用占位符"
```

---

## Task 7: capabilities.ts 删 siliconflow 条目

**Files:**
- Modify: `src/providers/capabilities.ts`

- [ ] **Step 1: 删除 siliconflow 条目**

把 `src/providers/capabilities.ts` 的 `CAPABILITY_PROFILES` 改为：

```ts
/** 只登记已验证或有明确文档依据的差异；未知能力保持保守回退。 */
export const CAPABILITY_PROFILES: Record<string, Partial<Capabilities>> = {
  "custom/mimo-v2.5": { maxImages: 5, systemPromptMode: "merge_user" },
};
```

（删除 `"siliconflow/deepseek-ai/DeepSeek-OCR": { systemPromptMode: "merge_user" },` 这一行；其余文件内容不变。）

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过（无外部引用变化）。

- [ ] **Step 3: commit**

```bash
git add src/providers/capabilities.ts
git commit -m "refactor: 删除 capabilities 中已不触达的 siliconflow 条目"
```

---

## Task 8: 五个内置 client 子类打 dormant 注释

**Files:**
- Modify: `src/providers/zhipu-client.ts`, `siliconflow-client.ts`, `qwen-client.ts`, `volcengine-client.ts`, `hunyuan-client.ts`

- [ ] **Step 1: 每个文件顶部插入注释**

在 5 个文件各自的 `import type { VisionKitConfig }` 之前，作为文件首行，插入：

```ts
/** Dormant: 保留供未来 live-probe 兼容性矩阵恢复使用，见 AGENTS.md。custom-only 模式下不触达。 */
```

（例如 `src/providers/zhipu-client.ts` 第 1 行前插入该注释；其余 4 个同样处理。）

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: commit**

```bash
git add src/providers/zhipu-client.ts src/providers/siliconflow-client.ts src/providers/qwen-client.ts src/providers/volcengine-client.ts src/providers/hunyuan-client.ts
git commit -m "chore: 内置 provider 子类标记为 dormant"
```

---

## Task 9: 迁移 tools/ 下 vision-client shim import

**Files:**
- Modify: `src/tools/execution-strategy.ts:1`, `src/tools/handler.ts:2`, `src/tools/video-handler.ts:2`

- [ ] **Step 1: execution-strategy.ts 改 import**

`src/tools/execution-strategy.ts` 第 1 行：

```ts
import type { VisionClient } from "../providers/vision-client.js";
```

- [ ] **Step 2: handler.ts 改 import**

`src/tools/handler.ts` 第 2 行：

```ts
import type { Capabilities, VisionClient } from "../providers/vision-client.js";
```

- [ ] **Step 3: video-handler.ts 改 import**

`src/tools/video-handler.ts` 第 2 行：

```ts
import type { VisionClient } from "../providers/vision-client.js";
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: src 下报错消除；剩余报错（若有）只在 test/ 的 shim 引用。

- [ ] **Step 5: commit**

```bash
git add src/tools/execution-strategy.ts src/tools/handler.ts src/tools/video-handler.ts
git commit -m "refactor: tools 下 import 迁移到 providers/vision-client"
```

---

## Task 10: 迁移 test/ 下 shim import + 删除 test-custom.ts

**Files:**
- Modify: `test/test-local.ts:11`, `test/manual/phase4-mimo-zoom-compare.ts:11`
- Delete: `test/test-custom.ts`

- [ ] **Step 1: test-local.ts 改 import**

`test/test-local.ts` 第 11 行，把：

```ts
import { createClient } from "../src/client-registry.js";
```

改为：

```ts
import { createClient } from "../src/providers/registry.js";
```

并把文件头注释里 `src/client-registry.ts` 的提及改为 `src/providers/registry.ts`（第 3-4 行注释）。

- [ ] **Step 2: phase4-mimo-zoom-compare.ts 改 import**

`test/manual/phase4-mimo-zoom-compare.ts` 第 11 行：

```ts
import type { VisionClient } from "../../src/providers/vision-client.js";
```

- [ ] **Step 3: 删除 test-custom.ts**

Run:
```bash
git rm test/test-custom.ts
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: test 下 shim 引用报错消除。

- [ ] **Step 5: commit**

```bash
git add test/test-local.ts test/manual/phase4-mimo-zoom-compare.ts
git commit -m "refactor: 测试脚本 import 迁移，删除 test-custom.ts"
```

---

## Task 11: 删除全部根目录 re-export shim

**Files:**
- Delete: `src/vision-client.ts`, `src/custom-client.ts`, `src/zhipu-client.ts`, `src/siliconflow-client.ts`, `src/qwen-client.ts`, `src/volcengine-client.ts`, `src/hunyuan-client.ts`, `src/client-registry.ts`

- [ ] **Step 1: 先 typecheck 确认无 shim 引用残留**

Run: `npm run typecheck`
Expected: 通过。若仍报 `src/vision-client.js` / `src/client-registry.js` 之类引用，先回到 Task 9/10 处理，不可跳过。

- [ ] **Step 2: 删除 8 个 shim 文件**

Run:
```bash
git rm src/vision-client.ts src/custom-client.ts src/zhipu-client.ts src/siliconflow-client.ts src/qwen-client.ts src/volcengine-client.ts src/hunyuan-client.ts src/client-registry.ts
```

- [ ] **Step 3: typecheck + build 确认全绿**

Run: `npm run typecheck && npm run build`
Expected: 两条命令均通过。

- [ ] **Step 4: commit**

```bash
git commit -m "refactor: 删除根目录 re-export shim"
```

---

## Task 12: 更新 provider-contract.test.ts

**Files:**
- Modify: `test/unit/provider-contract.test.ts`

- [ ] **Step 1: 更新 baseConfig 与 custom 用例**

把 `test/unit/provider-contract.test.ts` 的 `baseConfig`（第 11-15 行）改为：

```ts
const baseConfig: VisionKitConfig = {
  provider: "custom", apiKey: "test-key", model: "test-model", maxTokens: 8192,
  temperature: 0.7, topP: 0.95, enableThinking: true, multiCrop: true,
  multiCropMaxTiles: 5, capabilityOverrides: {},
  customProvider: { apiKey: "test-key", baseUrl: "https://example.test/v1", model: "test-model" },
};
```

- [ ] **Step 2: 修正用 ZhipuClient 的现有用例**

第 28-91 行用到 `new ZhipuClient(baseConfig, factory)` 的用例（"未知模型保守限制"、"空图片请求"、"Provider 错误统一归一化"、"空响应"、"native system prompt"、"merge_user"、"Zhipu thinking"）继续可用——ZhipuClient 构造只读 `config.apiKey` / `config.model` / `config.capabilityOverrides`，不读 `customProvider`。这些用例**不改**。

- [ ] **Step 3: 重写 mimo-v2.5 用例**

把第 166-176 行的 mimo 用例替换为：

```ts
it("mimo-v2.5 使用已验收的五图 profile，custom thinking disabled 给出 warning", async () => {
  const { factory, post } = fakeTransport();
  const client = new CustomClient({
    ...baseConfig, provider: "custom", model: "mimo-v2.5",
    customProvider: { apiKey: "mimo-secret", baseUrl: "https://example.test/v1", model: "mimo-v2.5" },
  }, factory);
  const result = await client.analyze({ images: ["1", "2", "3", "4", "5"], userPrompt: "u", thinking: true });
  expect(post).toHaveBeenCalledOnce();
  expect(result.warnings).toEqual([expect.stringContaining("未配置 thinking")]);
  expect(client.capabilities.maxImages).toBe(5);
});
```

- [ ] **Step 4: 删除 Custom thinking 模式 it.each（178-204 行）**

删除整个 `"Custom %s thinking=%s payload 正确"` 的 `it.each` 块（custom-only 后不再有 openai/qwen_extra_body 模式）。

- [ ] **Step 5: 重写 Custom 鉴权 it.each（206-228 行）为单个 Bearer 用例**

把第 206-228 行替换为：

```ts
it("Custom 统一使用 Bearer 鉴权，并用 normalizeEndpoint 拆分完整 URL", () => {
  const { factory, transports } = fakeTransport();
  new CustomClient({
    ...baseConfig,
    provider: "custom",
    customProvider: {
      apiKey: "secret",
      baseUrl: "https://example.test/v1/chat/completions",
      model: "other-model",
    },
  }, factory);
  expect(transports[0]).toMatchObject({
    baseUrl: "https://example.test/v1",
    requestPath: "/chat/completions",
    timeoutMs: 60_000,
  });
  expect(transports[0].headers.Authorization).toBe("Bearer secret");
  expect(transports[0].headers["Content-Type"]).toBe("application/json");
});
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test:unit -- provider-contract`
Expected: PASS。注意 `baseConfig` 的 `provider` 现在是 `"custom"`，但内置 5 家 client 不读此字段，它们的 transport 是硬编码常量，原断言仍成立。

- [ ] **Step 7: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 8: commit**

```bash
git add test/unit/provider-contract.test.ts
git commit -m "test: provider-contract 适配 custom 三字段与统一 Bearer"
```

---

## Task 13: 全量单元测试 + build 验证

**Files:** 无（验证步骤）

- [ ] **Step 1: 全量 unit**

Run: `npm run test:unit`
Expected: 全绿。记录用例总数（较删除前减少，因删了 2 个测试文件 + test-custom）。

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: pack dry-run 确认发布包结构**

Run: `npm pack --dry-run`
Expected: 包含 NOTICE、README、package.json 与 build 产物；不含测试、src 源码、.mcp.json 或密钥。

- [ ] **Step 4: configure 冒烟（不落盘验证）**

Run:
```bash
echo "https://api.example.com/v1" | npm run configure
```
（单行 piped 输入会因不足 3 行走交互失败；改为交互式手动验证更稳。）

手动验证（在项目根目录交互运行）：
```bash
npm run configure
```
依次输入 `https://api.example.com/v1`、`test-model`、`dummy-key`。
Expected:
- 打印一段 JSON 片段，含 `"VISIONKIT_API_KEY": "<在此粘贴你的 API key>"`（不是真实 dummy-key）。
- 项目根目录**不**创建 `.visionkit-mcp/` 目录。

- [ ] **Step 5: 记录用例新总数（写进 Task 14 STATUS 更新）**

记下 `npm run test:unit` 的用例总数 X / 文件数 Y，供 Task 14 写入 STATUS。

---

## Task 14: 文档同步（README / STATUS / AGENTS）

**Files:**
- Modify: `README.md`, `docs/STATUS.md`, `AGENTS.md`

- [ ] **Step 1: README 重写配置章节**

把 `README.md` 从第 43 行 `## 配置` 起到 `### 快捷配置命令` 之前的整段（含 Claude Desktop 示例、provider 映射、Custom Provider v1.5.0+ 小节、configure 说明）替换为：

````markdown
## 配置

VisionKit 是 custom-only：通过任意 OpenAI 兼容端点接入视觉模型，统一 `Authorization: Bearer` 鉴权。三个环境变量即可完成配置。

### MCP 客户端配置示例

```json
{
  "mcpServers": {
    "visionkit-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "visionkit-mcp"],
      "env": {
        "VISIONKIT_API_KEY": "YOUR_API_KEY",
        "VISIONKIT_BASE_URL": "https://your-provider.example/v1",
        "VISIONKIT_MODEL": "your-model"
      }
    }
  }
}
```

- `VISIONKIT_API_KEY`：API key（必填）。
- `VISIONKIT_BASE_URL`：OpenAI 兼容端点（必填）。填到版本前缀即可，例如 `https://api.example.com/v1`；也支持填到完整路径 `.../v1/chat/completions`，VisionKit 会自动拆分。
- `VISIONKIT_MODEL`：模型名（必填）。

### Claude Code

```bash
claude mcp add -s user visionkit-mcp \
  --env VISIONKIT_API_KEY=YOUR_API_KEY \
  --env VISIONKIT_BASE_URL=https://your-provider.example/v1 \
  --env VISIONKIT_MODEL=your-model \
  -- npx -y visionkit-mcp
```

### 生成配置片段

如果想在交互式引导下生成配置片段，可在项目根目录运行：

```bash
npm run configure
```

命令会询问 API endpoint、Model name、API key 三项，然后打印一段可直接粘贴到客户端的配置片段。**该命令不会保存任何文件，也不会把真实 API key 打到屏幕**——片段里的 key 是占位符，请在粘贴到客户端后手动填入。

### 迁移说明（从旧版多 provider 升级）

旧版的 `MODEL_PROVIDER=zhipu`（以及 siliconflow / qwen / volcengine / hunyuan）已不再支持。请改为 custom 配置：

```
# 旧
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=xxxxx

# 新
VISIONKIT_API_KEY=xxxxx
VISIONKIT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISIONKIT_MODEL=glm-4.6v
```

> ⚠️ 以下 endpoint 与模型是从旧版内置代码中提取的迁移参考，均**未做 live probe 验证**，不构成产品推荐或兼容性承诺。迁移后如遇问题，以各家官方文档为准。

| 原 provider   | BASE_URL                                              | 默认 MODEL                     |
| ------------- | ----------------------------------------------------- | ------------------------------ |
| zhipu         | `https://open.bigmodel.cn/api/paas/v4`                | `glm-4.6v`                     |
| siliconflow   | `https://api.siliconflow.cn/v1`                       | `deepseek-ai/DeepSeek-OCR`     |
| qwen          | `https://dashscope.aliyuncs.com/compatible-mode/v1`   | `qwen3-vl-flash`               |
| volcengine    | `https://ark.cn-beijing.volces.com/api/v3`            | `doubao-seed-1-6-flash-250828` |
| hunyuan       | `https://api.hunyuan.cloud.tencent.com/v1`            | `hunyuan-t1-vision-20250916`   |
````

- [ ] **Step 2: 删除 README 的环境变量 provider 表与本地开发模式里的 MODEL_PROVIDER**

在 `## 环境变量` 章节（原第 210 行起）：
- 把 `MODEL_PROVIDER` 一行从"通用配置"表删除。
- 删除整个 `### 提供商密钥` 小节（原第 242-251 行的 5 家 provider key 表）。

`#### 本地开发模式`（原第 139-154 行）示例里的 `"MODEL_PROVIDER": "zhipu", "ZHIPU_API_KEY": "your-api-key"` 改为：

```json
"env": {
  "VISIONKIT_API_KEY": "your-api-key",
  "VISIONKIT_BASE_URL": "https://your-provider.example/v1",
  "VISIONKIT_MODEL": "your-model"
}
```

Cline/VSCode 示例（原第 156-173 行）同步改为上述三件套。

- [ ] **Step 3: STATUS.md 增加期7条目**

在 `## 当前阶段` 末尾加一条：

```markdown
- 期7 custom-only 收敛完成：产品入口改为 `VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 三件套，统一 Bearer；`MODEL_PROVIDER` 非custom 值报迁移错误；configure 改为打印配置片段不落盘；内置 5 家薄子类保留为 dormant。属破坏性变更，旧配置需按 README 迁移说明升级。
```

在 `## 已验证状态` 末尾把测试统计更新为 Task 13 记录的新总数（X 个用例 / Y 个文件）。

- [ ] **Step 4: AGENTS.md 更新配置概念与阶段**

把 `## 配置概念`（原第 92-97 行）替换为：

```markdown
## 配置概念

- custom-only：产品入口只有 custom provider，连接信息从 `VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 三个 env 读取，统一 `Authorization: Bearer`。旧的多 provider 与项目内配置文件已移除。
- 能力 profile：代码内 `CAPABILITY_PROFILES` 描述最大图片数、system prompt 方式等模型能力，不保存密钥。
- 内置五家 provider（zhipu/siliconflow/qwen/volcengine/hunyuan）的薄子类保留为 dormant，custom-only 模式下不触达；未来建立 live-probe 兼容性矩阵后再恢复注册。
- `npm run configure` 打印配置片段不落盘；不再写入 `.visionkit-mcp/config.json`。
```

在 `## 当前阶段` 末尾加一句：

```markdown
- 期7 custom-only 配置收敛已完成，内置 5 家 provider 降级为 dormant。
```

并在 `## 常用命令` 对 `npm run configure` 的说明（原第 82 行）改为：

```markdown
- `npm run configure` 打印一段 stdio 配置片段到 stdout，不落盘、不打印真实 key；整个 `.visionkit-mcp/` 目录在期7后不再由该命令创建。
```

- [ ] **Step 5: typecheck（文档不改类型，但确认未误伤）**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 6: commit**

```bash
git add README.md docs/STATUS.md AGENTS.md
git commit -m "docs: 同步 custom-only 配置收敛说明与迁移指引"
```

---

## Task 15: 真实回归（需用户授权 API 调用）

**Files:** 无（验证步骤）

> ⚠️ 本任务消耗真实 API。执行前必须获得用户明确授权。

- [ ] **Step 1: 确认用户授权**

向用户确认：是否授权运行 `npm run test:phase3-mimo`（会用真实 mimo key 调用 7 个工具）。未授权则跳过本 Task，在最终报告标注"真实回归未执行"。

- [ ] **Step 2: 设置 VISIONKIT_* env 并跑 phase3-mimo**

在用户授权后，用真实 mimo 配置运行（key 由用户提供，不写入仓库）：

```powershell
$env:VISIONKIT_API_KEY="<用户提供的 mimo key>"
$env:VISIONKIT_BASE_URL="https://api.xiaomimimo.com/v1"
$env:VISIONKIT_MODEL="mimo-v2.5"
npm run test:phase3-mimo
```

Expected: 7 个工具（image_analysis、extract_text_from_screenshot、diagnose_error_screenshot、understand_technical_diagram、analyze_data_visualization、ui_to_artifact、ui_diff_check）全部真实调用成功。这是验证"统一 Bearer 后小米 MiMo 端点仍通"的命门。

- [ ] **Step 3: 若失败，记录并回到 Task 3/4 排查**

若 phase3-mimo 失败，记录错误（特别注意 401/404/重复 path），回到 Task 1（normalizeEndpoint）或 Task 3（Bearer header）排查；不要标记本计划完成。

---

## Self-Review 记录

- **Spec 覆盖**：D1–D7 全部映射到 Task。D1/D6→Task 2；D2→Task 2/3；D3→Task 6；D4→Task 5；D5→Task 4/8；D7→Task 1/3。文档→Task 14。验证门槛→Task 13/15。
- **Placeholder**：无 TBD/TODO；每步含完整代码或精确命令。
- **类型一致**：`CustomProviderConfig` 在 Task 2 定义为三字段，Task 3/12 引用一致；`normalizeEndpoint` 在 Task 1 定义、Task 3 引用；`CLIENT_REGISTRY` 在 Task 4 重定义。
- **关键风险已覆盖**：根目录 shim 的 5 处真实 import（含 test-local、phase4-manual）在 Task 9/10 迁移后才在 Task 11 删除；删除前 Task 11 Step 1 有 typecheck 门禁。
