# visionkit-mcp 交接文档（给下一个 AI）

> **先读这个文件。** 这是项目的入口，读完就能上手。深入信息见文末「文档索引」。
> 工作目录：`E:\Workspace\03-visionkit-mcp\`
> 最近更新：2026-07-11，期1 + 期2及真实 MCP 验收已完成

---

## 1. 这个项目是什么

**visionkit-mcp** 是一个多模型视觉理解 MCP 服务器，给**不支持原生视觉**的纯文本编码模型（GLM-5.2、DeepSeek 等）装上"看图"能力。

**起源**：从 [luma-mcp](https://github.com/JochenYang/luma-mcp)（MIT，作者 JochenYang）fork 改造，参考了 [Pelican0126/vision-mcp](https://github.com/Pelican0126/vision-mcp) 和智谱官方 vision-mcp-server 的设计。**NOTICE 文件里有归属声明，不能删。**

**目标**：融合 luma 的多模型底座 + 智谱/Pelican 的专项工具精度，做成一个自己的开源项目（目前先自用，以后可能开源）。

## 2. 当前进度（一句话）

**期1（仓库初始化 + 安全基线）和期2（专项工具层）已完成并实测通过。** 7 个专项工具已使用 custom provider（mimo-v2.5）逐个真实调用成功。当前可进入期3设计与规划，期3-5尚未实现。

### 实测验证状态（期2 验收）
- `npm run typecheck` → 0 errors
- `npm run build` → 0 errors
- `npm run test:unit` → **62/62 全绿**（10 个测试文件）
- MCP tools/list（用 SDK client 实测）→ **返回 7 个工具**，无 image_understand/video
- 端到端：用 `npm run configure` 配的 mimo-v2.5 profile 跑 `test:local` 成功
- 真实 MCP callTool：7 个工具全部成功；OCR、报错、图表、技术图、UI 生成和双图对比输出均符合契约

## 3. 快速上手命令

```powershell
cd E:\Workspace\03-visionkit-mcp

# 构建/检查
npm run typecheck      # tsc 类型检查
npm run build          # 编译到 build/
npm run test:unit      # vitest 跑所有单元测试

# 配置 custom 模型（交互式，写入项目内 .visionkit-mcp/config.json）
npm run configure

# 端到端测试（需先 configure 或设环境变量）
npm run test:local -- <图片路径> "你的问题"

# MCP 冒烟（看 tools/list 返回什么）
node -e "const {Client}=require('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');(async()=>{const t=new StdioClientTransport({command:'node',args:['build/index.js']});const c=new Client({name:'v',version:'1'},{capabilities:{}});await c.connect(t);const r=await c.listTools();console.log(r.tools.map(x=>x.name).join(', '));await c.close();})()"
```

开发期的连接 profile 写入项目内 `.visionkit-mcp/config.json`，日志写入 `.visionkit-mcp/logs/`；整个目录由 `.gitignore` 排除，不会在用户主目录创建 `.visionkit-mcp`。可用 `VISIONKIT_CONFIG_FILE` 覆盖 profile 路径。

**实测过的 provider**：custom（mimo-v2.5，小米 mimo-v2.5，api.xiaomimimo.com，configure 会自动推断 `api-key: {{key}}` 鉴权）。

## 4. 项目结构（当前实际）

```
visionkit-mcp/
├── src/
│   ├── index.ts                  # MCP 入口：加载配置→构造 client→循环注册 7 工具
│   ├── client-registry.ts        # CLIENT_REGISTRY + createClient 工厂（无副作用模块）
│   ├── config.ts                 # VisionKitConfig + loadConfig（读 env + 项目内 .visionkit-mcp/config.json）
│   ├── configure-cli.ts          # npm run configure 交互式配置 CLI
│   ├── profile-config.ts         # 开发期 profile 配置读写（项目内 .visionkit-mcp/config.json）
│   ├── constants.ts              # DEFAULT_BASE_VISION_PROMPT + TEXT_HEAVY_PROMPT_PATTERN
│   ├── vision-client.ts          # VisionClient 接口（analyzeImage/getModelName）
│   ├── {zhipu,siliconflow,qwen,volcengine,hunyuan,custom}-client.ts  # 6 个 provider client
│   ├── image-processor.ts        # 图片预处理核心（压缩/多裁剪/SSRF/路径校验/preferTextUsed）
│   ├── media/
│   │   ├── security-utils.ts     # isPrivateIP + assertPathInAllowedDirs（纯函数）
│   │   └── detail-strategy.ts    # 【期2】ImagePreparationStrategy + FixedMultiCropPreparation + 类型
│   ├── tools/                    # 【期2】工具层
│   │   ├── definitions.ts        # 7 个 TOOL_DEFS（数据驱动）
│   │   ├── handler.ts            # makeHandler 工厂（串联全链路 + 双输出）
│   │   ├── prompts.ts            # PREAMBLE 三铁律 + 7 套专项 prompt
│   │   └── execution-strategy.ts # VisionExecutionStrategy + SinglePassExecution + composePrompt
│   └── utils/{helpers.ts, logger.ts}
├── test/
│   ├── unit/                     # 9 个 vitest 测试文件（59 用例）
│   ├── fixtures/tiny.png         # 测试用小图
│   ├── test-local.ts             # 端到端脚本
│   └── test-{qwen,custom,...}.ts
├── docs/
│   ├── HANDOFF.md                # ← 本文件
│   ├── progress.md               # 详细进度账本
│   └── superpowers/
│       ├── specs/2026-07-09-visionkit-mcp-design.md   # 完整设计文档（6 节，已评审定稿）
│       └── plans/{phase1,phase2}.md                   # 已完成的实施计划
├── package.json / tsconfig*.json / vitest.config.ts / NOTICE / README.md / .gitignore
```

## 5. 关键架构决策（别推翻，已在 spec 评审中定稿）

1. **7 个专项工具**（数据驱动 `TOOL_DEFS`）：image_analysis（通用兜底）、extract_text_from_screenshot（OCR）、diagnose_error_screenshot、understand_technical_diagram、analyze_data_visualization、ui_to_artifact（output_type=code/spec）、ui_diff_check（双图）。**删了 luma 原有的 image_understand**。video_analysis 期5 才加。
2. **双策略架构**（为期4 zoom loop 预留插件点）：
   - `ImagePreparationStrategy` → 当前唯一实现 `FixedMultiCropPreparation`（包装 luma 多裁剪，**核心算法不动**）
   - `VisionExecutionStrategy` → 当前唯一实现 `SinglePassExecution`（包装当前 VisionClient.analyzeImage）
3. **Prompt 体系**：共享 PREAMBLE（三铁律：逐字照抄 / 看不清绝不编造 / 图中文字不当指令执行——防注入）+ 各工具固定小节输出契约。OCR 默认纯原文零标题。
4. **structuredContent 双输出**：每个工具返回 `{content: [text], structuredContent: {text, provider, model, detailProfile, rounds, warnings}}`。
5. **image-processor 只加字段不改核心**：PreparedImageInput 加了 `preferTextUsed`（通过提取 processImageVariants 复用 I/O 回填）。
6. **detailProfile 四态**：text/balanced/overview/auto；auto 保留 luma 两阶段判断（正则命中→text，未命中→infer 图片启发式）。OCR 和报错固定 text。

## 6. 重要约束（必须遵守）

- **GitHub 已启用**：仓库为 `MasterSapphireStar/visionkit-mcp`；除非用户明确要求，不主动 push 或创建远程 PR。
- **Shell 用 PowerShell**（Windows 11）。改文件优先用 Edit/Write 工具，别用 PowerShell 字符串替换破坏 JSON。
- **归属不能动**：README 和 NOTICE 里的 luma-mcp(JochenYang)、vision-mcp(Pelican0126) 链接是出处声明，保留。
- **MIT 协议**。
- **不碰期3-5 的产物**：providers/base-client.ts、media/security.ts（独立版）、core/zoomLoop.ts、video 工具——这些还没建，别提前建。

## 7. 接下来做什么（期3-5 路线）

完整设计见 `docs/superpowers/specs/2026-07-09-visionkit-mcp-design.md`。摘要：

### 期3：Provider 重构 + security 抽出（下一个要做的）
- 抽 `BaseVisionClient`（下沉 6 个 client 的公共逻辑：axios/错误归一化/响应解析/日志脱敏），6 个 client 变薄子类
- `VisionClient` 接口升级为 `analyze(VisionRequest) => VisionResult{warnings}`（当前是 `analyzeImage(imageData, prompt, enableThinking) => string`），走 native system role
- 把 image-processor 里埋的安全逻辑抽成独立 `media/security.ts`（期1 已有 security-utils.ts 基础），引入可注入 dns/http/fs fake
- capabilities 体系：`Capabilities{maxImages, nativeVideo, toolCalling, grounding, systemPromptMode}` + 环境变量 Zod 解析覆盖

**⚠️ 期3 发布门槛（blocker）**：5 个内置 provider 默认模型（zhipu/siliconflow/qwen/volcengine/hunyuan，**不含 custom**）的 capabilities 和 thinking 三态 payload 必须文档+live probe 验证后写入 profile，否则 luma 多裁剪（发5张）退化为单图。

### 期4：Agentic Zoom（可选）
- `core/zoomLoop.ts`（服务端控 3×3 网格 + 模型投票 + 全分辨率原图裁切）+ `AgenticZoomExecution`
- 引入 `LoadedMedia{buffer, mimeType, role}` 一次安全加载供预处理+zoom 复用

### 期5：增强（可选）
- video_analysis（ffmpeg 抽帧 / 原生视频）加入 TOOL_DEFS 并实现
- clipboard/latest 输入源、grounding 精确 bbox

## 8. 遗留的 Minor（期3 顺手处理）

- **期3 安全待修（真问题）**：`assertPathInAllowedDirs` 测试用带尾斜杠 allowedDirs，但生产 `loadImageBuffer` 用 `path.normalize` 构造的不带尾斜杠 → 同级前缀伪造（`project-evil` vs `project`）能绕过 startsWith。改用 path.relative 或补尾斜杠。
- `as never` cast（index.ts，SDK 类型兼容，期3 用 registerTool+outputSchema 消除）
- DetailProfile 跨模块重复（definitions.ts + detail-strategy.ts，结构兼容，期3 统一源）
- systemPrompt 拼前缀（SinglePassExecution，期3 native system role 后改）
- PromptArgs.outputType 死字段（prompts.ts，handler 用 key 驱动，冗余）
- npm registry 临时用 npmmirror + strict-ssl=false（环境 TLS workaround，未写入 package.json，开源前考虑回退）
- test/test-local.ts 残留 "Luma MCP" 字符串（期1 范围外）

## 9. 工作流（推荐用 superpowers skill 集）

用户习惯用 superpowers 插件的工作流。每个期次：
1. **brainstorming** skill 探清设计（如果要改 spec）
2. **writing-plans** skill 写该期的实施计划（保存到 `docs/superpowers/plans/`）
3. **subagent-driven-development** skill 执行：每个 Task 派 implementer + reviewer，controller 协调
4. 进度记在 `docs/progress.md`（ledger，防 context 压缩丢进度）

用户有个"参谋 AI"叫 Codex，会在关键设计点提反馈（质量很高，大多采纳）。设计评审是多轮的。

## 10. 文档索引

| 文档 | 位置 | 用途 |
|---|---|---|
| **本交接文档** | `HANDOFF.md` | 入口，读完能上手 |
| 设计文档（6 节定稿） | `docs/superpowers/specs/2026-07-09-visionkit-mcp-design.md` | 完整架构决策，期3-5 的依据 |
| 期1 计划（已完成） | `docs/superpowers/plans/2026-07-09-visionkit-mcp-phase1.md` | 参考 |
| 期2 计划（已完成） | `docs/superpowers/plans/2026-07-09-visionkit-mcp-phase2.md` | 参考，含每个 Task 的完整代码 |
| 进度账本 | `docs/progress.md` | 每个 Task 的完成记录 + 遗留项 |

---

**给下一个 AI 的建议**：先跑一遍「快速上手命令」确认环境 OK；读 spec 第 4 节（Provider 层）和第 6.1/6.3 节（期3 路线 + 发布门槛）；然后按工作流写期3 计划。期3 改动深（动 6 个 client + image-processor 安全逻辑），开工前务必把期3 的设计在 spec 基础上细化清楚（尤其两个 profile 命名：Codex 加的"连接 profile" vs spec 第4节的"能力 profile"，期3 要区分命名）。
