# VisionKit MCP · custom-only 配置收敛设计

> 阶段：期7（产品化第一项）
> 状态：设计稿，待用户复核
> 日期：2026-07-13

## 背景与动机

当前 VisionKit 的产品入口是"多 provider + 项目内配置文件"：

- `MODEL_PROVIDER` 支持 6 家（zhipu / siliconflow / qwen / volcengine / hunyuan / custom），默认 `zhipu`。
- 内置 5 家的 transport 硬编码在薄子类里，但从未做过 live probe，能力一直按保守单图默认。
- custom provider 通过 `CUSTOM_API_KEY` / `CUSTOM_BASE_URL` / `CUSTOM_MODEL_NAME` 这组 env，或读项目内 `.visionkit-mcp/config.json`（含明文 key）。
- `npm run configure` 交互三问后把 key 写进项目内配置文件。

这套形态对标准 MCP 客户端不友好：用户要先跑交互式 configure、维护一个私有配置文件，或者面对 6 家 provider 的选择负担。而 VisionKit 的核心定位是"让纯文本模型通过任意兼容视觉 API 获得稳定的视觉工具能力"，并不绑定某几家平台。

本设计把产品入口收敛为 **custom-only + 统一 env**，让标准 MCP 客户端用一段 `mcpServers / stdio / npx / env` 即可安装；内置 5 家代码作为 dormant 保留，不暴露、不进文档、不承诺能力。

## 目标

- 标准 MCP 客户端用一段 stdio 配置 + 三个 env 即可完成安装，无需交互式 configure、无需维护配置文件。
- 配置不携带密钥落盘：key 只由客户端进程 env 注入。
- 删除基于错误假设的 hostname 鉴权特判与冗余 auth 模式，统一 `Authorization: Bearer`。
- 内置 5 家薄子类代码保留为 dormant，未来建立真实兼容性矩阵后可零成本恢复。

## 锁定的决策

- **D1 兼容姿态**：custom-only 收敛。旧 `MODEL_PROVIDER=zhipu` 等写法需迁移，属破坏性变更。
- **D2 env 命名**：只留 `VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL`，删掉全部 `CUSTOM_*`。统一 `Authorization: Bearer`（小米 MiMo 官方支持 Bearer，已核实官方文档；`api-key:` 头特判基于已被推翻的假设，一并删除）。
- **D3 configure 去向**：`npm run configure` 改为交互三问 → 打印 stdio 配置片段（含 env），不落盘、不写 key。
- **D4 profile-config**：整个删 `src/profile-config.ts` + 其两个测试文件 + 所有连带 import。
- **D5 内置 provider**：5 个薄子类文件保留，顶部打 dormant 注释指向 AGENTS.md；`registry.ts` 收口到只暴露 custom。
- **D6 MODEL_PROVIDER**：保留解析作迁移守卫——非 `custom` 值启动即报清晰迁移错误，不静默回退。
- **D7 扩展 env**：删 `CUSTOM_AUTH_HEADER` / `CUSTOM_PATH` / `CUSTOM_TIMEOUT_MS` / `CUSTOM_THINKING_MODE` / `CUSTOM_AUTH_HEADER_VALUE`；`path` 不作 env 暴露，由代码内 `resolveRequestPath(baseUrl)` 智能拼接。

## 最终用户体验

README 主推形态：

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

`"type": "stdio"` 虽是默认值，但作为文档主推形态带全字段更稳，用户复制粘贴不会因客户端版本差异出问题。

## 架构总览

收敛后的配置数据流：

```
客户端 env (VISIONKIT_API_KEY / BASE_URL / MODEL)
        │
        ▼
   loadConfig()            ← src/config.ts，custom-only，MODEL_PROVIDER 作迁移守卫
        │
        ▼  VisionKitConfig { provider:"custom", customProvider:{apiKey,baseUrl,model}, ... }
   createClient(config)    ← src/providers/registry.ts，只暴露 custom
        │
        ▼
   CustomClient            ← 统一 Bearer + resolveRequestPath(baseUrl)
        │
        ▼
   BaseVisionClient.analyze()  ← 不变
```

关键变化集中在三层：配置层（config.ts）、provider 注册与 custom client（registry / custom-client / 新增 request-path）、入口与 shim（configure-cli / shim 清理）。`BaseVisionClient`、tools、media、quality 等模块不动。

## 详细改动清单

### 1. 配置层

#### `src/config.ts`（核心重构）

- `ModelProvider` 类型收敛为 `type ModelProvider = "custom"`。
- 删除 zhipu / siliconflow / qwen / volcengine / hunyuan 五个分支的 apiKey 读取与 `defaultModel` 表。
- 删除 `readUserConfig` / `resolveConfiguredProfile` import 与调用；删除 `VISIONKIT_CONFIG_FILE`、`VISIONKIT_PROFILE` 读取；删除 custom 分支里读 `configuredProfile?.*` 的回退。
- `MODEL_PROVIDER` 保留解析作迁移守卫（D6）：
  - 值缺省或 `"custom"` → 走正常 custom 路径。
  - 值为其他（zhipu / siliconflow / qwen / volcengine / hunyuan 或任意值）→ 抛错，消息明确指路：
    > `MODEL_PROVIDER=<value> is no longer supported. VisionKit is now custom-only. Set VISIONKIT_BASE_URL / VISIONKIT_API_KEY / VISIONKIT_MODEL instead. See README migration notes.`
- custom 配置只读三个 env：`VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL`，缺一即抛错（沿用现有缺参报错风格）。删除全部 `CUSTOM_*` 读取。
- `CustomProviderConfig` 类型收敛为 `{ apiKey: string; baseUrl: string; model: string }`（D7）。`timeoutMs` 移出类型，改为 `CustomClient` 内常量（60_000）；`authHeader` / `authHeaderValue` / `path` / `thinkingMode` 字段删除。

#### `src/profile-config.ts` → 整个删除（D4）

连带清理（已核实引用面）：

- `src/configure-cli.ts`：删 `createCustomProfileConfig` / `writeUserConfig` / `getDefaultUserConfigPath` import。
- `src/config.ts`：删 `readUserConfig` / `resolveConfiguredProfile` import（见上文）。
- 删测试：`test/unit/profile-config.test.ts`、`test/unit/config-profile.test.ts`（整文件）。

### 2. Provider 层

#### `src/providers/registry.ts`

- `CLIENT_REGISTRY` 收口为只暴露 `custom`：`{ custom: (config) => new CustomClient(config) }`。
- import 改为 `from "./custom-client.js"`（不再经根目录 shim）。
- `createClient` 保留；未知 provider 的错误消息更新为指向迁移说明。理论上 loadConfig 阶段已拦截非 custom 值，此处为防御性兜底。

#### `src/providers/custom-client.ts`

- `buildHeaders` 收敛为统一 Bearer：
  ```ts
  { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }
  ```
  删除 `authHeader` / `authHeaderValue` 分支。
- `applyThinking`：custom-only + 删除 `CUSTOM_THINKING_MODE` 后，统一返回"未配置 thinking 支持，已忽略"提示（保持现状 disabled 行为），不再读 `thinkingMode`。
- `requestPath` 由新函数 `resolveRequestPath(baseUrl)` 解析（见下），不从 config 读。
- 构造函数对 `config.customProvider` 缺失仍抛错（保留现有校验）。
- `timeoutMs` 用内置常量 `60_000`。

#### 新增 `src/providers/request-path.ts`（D7）

导出纯函数：

```ts
export function resolveRequestPath(baseUrl: string): string
```

规则：

- 若 baseUrl 已以 `/chat/completions` 结尾 → 返回 `/chat/completions`（即原样使用，避免重复拼接）。
- 否则 → 返回 `/chat/completions`（baseURL 前缀由 axios 在 `baseURL + requestPath` 时拼接）。

设计取舍：只判断是否已含 `/chat/completions`，不尝试"补 `/v1`"——因为各家 `/v1` 是否存在是 endpoint 差异（OpenAI 兼容端点用户自己最清楚），代码不应替用户猜测版本前缀。这避免了"用户填 `.../v1` 被错误补成 `.../v1/v1`"的风险。覆盖放在 `test/unit/request-path.test.ts`。

#### 5 个内置 client 子类（dormant 保留，D5）

`src/providers/zhipu-client.ts` / `siliconflow-client.ts` / `qwen-client.ts` / `volcengine-client.ts` / `hunyuan-client.ts`：**代码不动**，每个文件顶部加一行注释：

```ts
/** Dormant: 保留供未来 live-probe 兼容性矩阵恢复使用，见 AGENTS.md。custom-only 模式下不触达。 */
```

理由：这些文件编码了最有价值的硬知识（每家 transport 常量、thinking 字段差异、SiliconFlow max_tokens 截断）。保留成本极低（不被引用的常量类），删了未来恢复需重写。dormant 注释明确意图，避免被"好心清理"。

#### `src/providers/capabilities.ts`

- `CAPABILITY_PROFILES` 删除 `siliconflow/deepseek-ai/DeepSeek-OCR` 条目（custom-only 不再触达内置）。
- 保留 `custom/mimo-v2.5`。
- `DEFAULT_CAPABILITIES` 不变。

### 3. 入口与 shim

#### `src/configure-cli.ts`（D3 重写）

交互三问（API endpoint / Model name / API key）→ **打印**一段 stdio 配置片段到 stdout，不落盘。片段结构：

```json
{
  "mcpServers": {
    "visionkit-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "visionkit-mcp"],
      "env": {
        "VISIONKIT_API_KEY": "<用户输入的 key>",
        "VISIONKIT_BASE_URL": "<用户输入的 endpoint>",
        "VISIONKIT_MODEL": "<用户输入的 model>"
      }
    }
  }
}
```

- 保留 piped 输入模式（无 TTY 时按行读 endpoint / model / apiKey 三项，与现有契约一致）。
- 保留 endpoint 尾斜杠 trim。
- **删除 hostname 鉴权推断**（`inferAuth`）——统一 Bearer 后不再需要。
- 不再 import profile-config 任何符号。

#### `src/index.ts`

- `process.argv[2] === "configure"` 分支保留。
- 其余不变（`loadConfig` → `createClient` → 注册工具）。

#### 根目录 re-export shim（6 个，先迁 import 再删）

核实后的引用面：`src/vision-client.ts` shim 被 `tools/` 下 **3 处** import（不是 5 处；base-client / capabilities / registry 那几处本来就直接从 `./providers/vision-client.js` 引，不走 shim）。

删除顺序：

1. **先迁 import**：`tools/execution-strategy.ts`、`tools/handler.ts`、`tools/video-handler.ts` 这 3 处的 `from "../vision-client.js"` 改为 `from "../providers/vision-client.js"`。
2. **删 `src/vision-client.ts` shim**（上一步完成后无引用）。
3. registry 收口并改直接 import 后，5 个 client shim（`src/zhipu-client.ts` / `siliconflow-client.ts` / `qwen-client.ts` / `volcengine-client.ts` / `hunyuan-client.ts` / `custom-client.ts`）无引用，可删。
4. `src/client-registry.ts`：内部只 re-export `./providers/registry.js`，`src/index.ts` 已直接 import `./providers/registry.js`，此 shim 可删。

### 4. 测试

- 删 `test/unit/profile-config.test.ts`（D4 连带）。
- 删 `test/unit/config-profile.test.ts`（D4 连带，且是唯一引用 `CUSTOM_*` 的单元测试）。
- **删 `test/test-custom.ts`**（不重写）——它测的 x-api-key / custom-header 两种 auth 模式已彻底移除；Bearer 统一后 `buildHeaders` 逻辑过简，不值得单测。
- `test/unit/provider-contract.test.ts`：更新 custom 构造用例——只传三字段 `customProvider`；headers 断言固定为 `Authorization: Bearer ...`；删除 x-api-key / custom-header 用例。SiliconFlow max_tokens 截断用例（client 代码未动）应仍通过，核实后保留。
- 新增 `test/unit/request-path.test.ts`：覆盖 `resolveRequestPath` 的正反例。
- manual 脚本（`test/test-local.ts` / `test/test-qwen.ts` / `test/test-deepseek-raw.ts` 等）：核实是否依赖 `CUSTOM_*` 或 `MODEL_PROVIDER`；依赖则更新为 `VISIONKIT_*`，或标注仅供 dormant 内置 client 验证。

### 5. 文档

- **`README.md`**：
  - 重写"配置"章节为 custom-only + Bearer。
  - 主推形态 JSON 含 `"type": "stdio"`。
  - 删除六家 provider 表与 `MODEL_PROVIDER` 示例。
  - 新增"迁移说明"小节：旧 `MODEL_PROVIDER=zhipu + ZHIPU_API_KEY` → 新三件套；列出各原内置 provider 的已知 endpoint + 默认模型（作为迁移参考，不作为产品推荐）。
  - `configure` 章节改为"生成配置片段"。
- **`docs/STATUS.md`**：新增"期7 custom-only 收敛"条目，记录破坏性变更与迁移路径。
- **`AGENTS.md`**：
  - 更新"配置概念"：连接 profile 概念移除（改为 env-only），保留 capability profile 概念。
  - 更新"当前阶段"：记录 dormant 内置 client 约定与 custom-only 产品入口。
  - `npm run configure` 说明改为"打印配置片段，不落盘"。

### 6. 不改动的部分（显式）

- `src/image-processor.ts`、`src/tools/*`（除 import 路径迁移）、`src/media/*`、`src/quality/*`。
- `bin` / `files` / 发布产物结构、`package.json` 依赖。
- 视频 / zoom / 证据约束逻辑。
- `.mcp.json`（仓库内该文件是本地 zai 实例，gitignored，不动）。

## 错误处理

- **缺 env**：`VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 任一缺失 → 启动抛错，消息指明缺哪个 env（沿用现有缺参风格）。这与现有 custom 分支行为一致，只是变量名换成 `VISIONKIT_*`。
- **旧 MODEL_PROVIDER**：非 custom 值 → 启动抛迁移错误（D6），不静默回退、不读不到 env 报含糊错。
- **path 拼接**：`resolveRequestPath` 只做"是否已含 `/chat/completions`"判断，不猜测版本前缀；用户填错 endpoint 导致的 404 由 provider 错误归一化（`normalizeError`，已脱敏）如实返回。
- **API 调用失败**：`BaseVisionClient.normalizeError` 不变，继续脱敏 key / Authorization / token。

## 测试策略

- **单元测试**：
  - 新增 `request-path.test.ts`（正反例）。
  - 更新 `provider-contract.test.ts`（custom 三字段 + Bearer 断言）。
  - 删除 profile-config 相关两个测试文件与 `test-custom.ts`。
- **类型与构建**：`npm run typecheck` 与 `npm run build` 必须通过——这是 shim 删除顺序正确性的硬验证（删早了会爆 import error）。
- **configure 行为**：手动跑 `npm run configure`（或 piped 输入），确认打印片段格式正确、不创建 `.visionkit-mcp/`。
- **不消耗 API 的验证优先**；真实模型调用仅在用户明确授权后执行。

## 验证门槛

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:unit` 通过（删除两个文件 + test-custom 后，用例数下降是预期的，需在 STATUS 记录新总数）。
- `npm pack --dry-run` 通过，发布包结构不变。
- `npm run configure` 打印片段正确、不落盘。

## 迁移说明（写入 README）

旧配置 → 新配置示例：

```
# 旧（zhipu）
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=xxxxx

# 新（custom，需自行填 zhipu 的 endpoint 与模型）
VISIONKIT_API_KEY=xxxxx
VISIONKIT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISIONKIT_MODEL=glm-4.6v
```

原内置 provider 的 endpoint 与默认模型（仅作迁移参考，不作为产品推荐，未做 live probe）：

| 原 provider   | BASE_URL                                              | 默认 MODEL                  |
| ------------- | ----------------------------------------------------- | --------------------------- |
| zhipu         | `https://open.bigmodel.cn/api/paas/v4`                | `glm-4.6v`                  |
| siliconflow   | `https://api.siliconflow.cn/v1`                       | `deepseek-ai/DeepSeek-OCR`  |
| qwen          | `https://dashscope.aliyuncs.com/compatible-mode/v1`   | `qwen3-vl-flash`            |
| volcengine    | `https://ark.cn-beijing.volces.com/api/v3`            | `doubao-seed-1-6-flash-250828` |
| hunyuan       | `https://api.hunyuan.cloud.tencent.com/v1`            | `hunyuan-t1-vision-20250916` |

## 风险与回滚

- **风险**：破坏性变更，现有用户启动会报迁移错误。缓解：错误消息明确指路 + README 迁移说明 + 版本号主/次版本 bump 提示。
- **风险**：shim 删除顺序错误导致 typecheck 失败。缓解：严格按"先迁 tools import → 删 vision-client shim → 收口 registry → 删 client shim"顺序，每步可独立 typecheck。
- **回滚**：dormant 内置 client 代码保留，恢复多 provider 仅需还原 registry / config 的 provider 分支与文档，不需要重写 client。
