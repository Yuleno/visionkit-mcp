# VisionKit MCP 当前状态

> 当前状态的唯一事实源。阶段、验收结果、已知问题或下一步发生变化时，只更新本文件。
> 最近更新：2026-08-05。

## 当前阶段

- 期1完成：仓库初始化、命名迁移、测试骨架和安全基线。
- 期2完成：7个专项工具、双策略、专项 prompts 和 structuredContent。
- 期2真实 MCP 验收完成：7个工具均通过 custom provider（mimo-v2.5）实际调用。
- 期3核心实现及 custom provider（mimo-v2.5）真实回归完成：统一 Provider 架构、capability profile、安全模块与日志脱敏已落地。
- 期4 Agentic Zoom 核心实现完成，默认关闭；自动化验证及 mimo-v2.5 首次开关对照已完成。
- 期5首版 `video_analysis` 完成：本地FFmpeg均匀抽帧路径、专用prompt/handler、安全预算及mimo-v2.5真实验收已落地；clipboard/latest与grounding继续暂缓。
- 期5.1智能关键帧完成：混合均匀/场景候选、颜色感知dHash去重、时序状态保留与失败降级已落地。
- 期6质量基础设施首版完成：4组图片 manifest、离线评分器、评分 CLI、专项证据约束和 UI diff 未测量样式值防护已落地。
- 期7 custom-only 收敛完成：产品入口改为 `VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 三件套，统一 Bearer；configure 打印配置片段不落盘。
- 期8（v1.6.0）实现完成：图片管线拆分为 source/transform/crop/cache/prepare 五个职责模块；删除五个 dormant provider、旧 `analyzeImage`、过渡导出和遗留供应商脚本；运行配置统一经 Zod 校验；服务版本读取 `package.json`；GitHub npx 固定版本标签；新增真实 stdio MCP 冒烟与构建前清理。
- 期8.1（v1.6.1）公共分发：GitHub 用户名统一为 `Yuleno`，npm 公共包成为主安装路径，GitHub npx 保留为备用；补齐 MIT LICENSE、第三方代码归属与 npm 发布保护。
- Anthropic Messages 协议支持完成：在 custom-only 架构内并行支持 OpenAI 兼容与 Anthropic Messages 两种协议，工具层零改动。新增 `VISIONKIT_PROTOCOL`（auto/openai/anthropic，默认 auto，按 base_url 自动探测）与 `VISIONKIT_ANTHROPIC_STRICTNESS`（vendor-loose/strict）。`AnthropicClient` 通用支持任意 Anthropic 兼容端点 + 多模态模型（阿里云百炼 qwen3.6-plus、小米 MiMo、官方 Claude 等）：vendor-loose 端点完整复用 OpenAI 路径的 temperature/top_p + thinking enabled/disabled（保证质量不回退），strict（官方 Claude 4.7+/5）省略采样参数与 thinking 字段。

## 已验证状态

- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm run test:unit`：19个测试文件、112个用例通过（v1.6.0 口径）。
- 期3实现后 `npm run typecheck`、`npm run build` 均通过。
- `npm run typecheck`、`npm run build`、`npm pack --dry-run` 期7 custom-only 收敛后均通过；`npm run configure` 打印配置片段、不落盘、key 用占位符。
- `npm run test:local`：mimo-v2.5 + 5图多裁剪端到端调用成功。
- MCP `tools/list`：mimo-v2.5 返回8个工具，新增 `video_analysis`；单图能力Provider因 `minImages=2` 不注册视频工具。
- MCP `callTool`：`image_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_to_artifact`、`ui_diff_check` 全部真实调用成功。
- 期3真实回归：通过 `npm run test:phase3-mimo` 启动重构后的 MCP server，以 mimo-v2.5 逐个调用上述 7 个工具全部成功；`ui_diff_check` 的双图请求成功。
- v1.6.0 重构后真实回归：使用代码内固定的无敏感 1×1 PNG Data URI，再次通过 mimo-v2.5 实际调用 7 个图片工具；前六个工具单图成功，`ui_diff_check` 双图成功，未读取或外发仓库/用户图片。
- `npm pack --dry-run`：v1.6.0 通过，共123个条目；发布包只包含 NOTICE、README、package.json 与干净 build 产物，不包含测试、开发配置、密钥或已删除 provider 的陈旧产物。
- `npm run test:smoke`：构建后的真实 stdio MCP 握手版本为 `1.6.0`，mimo-v2.5 能力下 `tools/list` 返回8个工具；不调用模型。
- v1.6.1 公共发布验证：`npm run typecheck`、19个测试文件/112个用例、`npm run build`、真实 stdio smoke 全部通过；npm registry 的 `latest` 已指向 `1.6.1`。发布包共124个条目，只含 LICENSE、NOTICE、README、package.json 与 build；生产依赖审计0漏洞，发布范围未发现疑似密钥。在全新临时目录通过 `npx -y visionkit-mcp@1.6.1` 完成真实 MCP 握手，服务版本为 `1.6.1`，`tools/list` 返回8个工具。
- 期4真实对照：以 `imageTest/deepswe.png` 调用 OCR 工具，关闭/开启 Zoom 各执行1次。两次均为 `rounds=1`，mimo-v2.5 在开启时直接返回 final，未请求动态裁剪；两份 OCR 结果完整度基本一致。因此继续保持默认关闭，且动态裁剪分支尚不能标记为 live 验收完成。
- 期4.1动态裁剪验收：自动生成4000×4000合成仪表盘，通过手动验收脚本注入右下角 `(2,2)` 决策，真实执行 LoadedMedia→3×3裁剪→mimo-v2.5 最终调用；返回正确验证码 `VK7Q-29MX-4P8R`、`rounds=2`，动态裁剪与最终调用链 live 通过。该结果不代表自动规划器一定会主动选择 Zoom。
- 修复 capability override 空值覆盖：未设置 `VISIONKIT_MAX_IMAGES` 等变量时不再以 `undefined` 覆盖模型 profile；mimo-v2.5 的运行时 `maxImages` 已恢复为5。
- 期5视频真实验收：FFmpeg 8.1.2从6.2秒合成视频均匀抽取5帧，mimo-v2.5准确输出红→绿→蓝时间线；`detailProfile=video`、`rounds=1`，仅产生1次API调用。
- 期5.1真实验收：8.3秒合成视频在2.0～2.25秒短暂出现黄色，5个均匀点全部漏过；智能采样从7个候选保留 `0.835s红/2.1s黄/2.35s红` 3帧，mimo-v2.5准确输出红→黄→红，仍只调用1次API。
- Anthropic 协议真实验收（百炼 qwen3.6-plus，`VISIONKIT_BASE_URL=https://dashscope.aliyuncs.com/apps/anthropic`，auto 探测为 anthropic+vendor-loose）：`npm run typecheck` 通过、19个测试文件/137个用例通过、`npm run build` 通过、`npm run test:smoke` 握手 1.6.1 / 8 工具通过。`npm run test:anthropic-mcp` 用 sharp 生成的 64×64 合成图，真实调用 7 个图片工具全部成功，模型准确识别纯色主色调与色值、正确判断无文字/无差异。A/B 对照（同一张蓝色合成图）：OpenAI 路径（compatible-mode）与 Anthropic 路径（apps/anthropic）对同一张图色值估计一致（均约 #2668C9），输出结构一致，证明双协议并存无质量回退。
- Anthropic 路径延迟优化（联网调研 + 实测对照后落地）：`ENABLE_THINKING` 默认从 `true` 改为 `false`（qwen3.6-plus 默认思考预算高达 81920 token，开思考单次约 25s、关闭约 3.5s，实测 OCR 关思考输出反而更完整）；AnthropicClient 改流式拉取（`stream:true` + SSE 累积成与非流式等价结构），降低首 token 等待并避免长请求超时。优化后实测：默认配置（thinking 关 + 流式）单次 image_analysis 约 2.5s（优化前约 40s，提升约 16 倍）；即使显式开 thinking 也从 25s 降到约 6s。用户需复杂推理时可设 `ENABLE_THINKING=true`。流式改造通过 base-client 新增 `sendRequest` 钩子实现，OpenAI 路径行为不变。
- URL 归一化通用化重构（联网调研国内主流厂商后落地）：废除 hostname 白名单（`detectProtocol`/`detectStrictness`/`looksAnthropic` 全删），协议与严格度改为用户显式声明——`VISIONKIT_PROTOCOL`（默认 `openai`）、`VISIONKIT_ANTHROPIC_STRICTNESS`（默认 `vendor-loose`），均不从 URL 推断。归一化收敛为统一函数 `resolveEndpoint(rawBaseUrl, protocol)`，一条铁律：**代码只补协议资源路径（OpenAI `/chat/completions`、Anthropic `/v1/messages`），绝不补版本前缀**——版本前缀（`/v1`、`/v4`、`/compatible-mode/v1` 等）一律视为 base_url 的一部分原样保留。实测覆盖小米 MiMo、Kimi、DeepSeek、智谱（3 端点）、百炼（2 端点）、火山方舟、百度千帆、阶跃、自建 `evo4.local` 共 ~20 个真实端点，零厂商特判。
- 视觉模型探索性对照：使用4组本地样本同图同提示词比较 VisionKit（mimo-v2.5）与智谱官方 MCP（GLM-4.6V）；两者在 OCR、技术图和报错诊断上均完成核心任务，UI diff 均有漏检或误判。VisionKit 本轮平均约10.0秒，智谱官方约50.2秒；样本量不足以得出模型全面优劣结论，详见 `docs/QUALITY_BENCHMARK.md`。
- 期6复测：强化证据约束后，当前4 case manifest 中 VisionKit 关键事实平均召回为100%、格式遵从4/4、无依据命中0；智谱官方为68.75%、格式遵从0/4、无依据命中2。该分数只对 manifest 已声明事实有效，不能外推为模型全面优劣。
- GitHub Actions CI已加入 Node 22 的 Ubuntu/Windows矩阵；checkout/setup-node v5复验后两端均通过，无旧Node运行时弃用警告。
- `npm ci` 干净安装通过；同时修复了旧锁文件缺失的 Sharp `@emnapi/*` 可选依赖元数据，CI安装路径已在本机预演。

## 当前运行约定

- 期7 起改为 custom-only 三件套：`VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 环境变量直接提供连接信息。
- 旧的开发期连接 profile（项目内 `.visionkit-mcp/config.json`）与 `VISIONKIT_CONFIG_FILE` 已随 custom-only 收敛移除。
- v1.6.1 起优先通过 npm 固定版本安装；GitHub npx 仅作为备用，npm 12 使用 Git 依赖时需显式启用 `allow-git`。
- 真实模型调用会消耗 API，执行前必须获得用户确认。
- Anthropic 协议：协议默认 `auto` 探测（base_url 命中 `api.anthropic.com`、`/apps/anthropic`、`xiaomimimo.com/anthropic` 走 anthropic，否则 openai），可用 `VISIONKIT_PROTOCOL` 显式指定。Anthropic 端点严格度默认按 host 探测（官方→strict，第三方→vendor-loose），可用 `VISIONKIT_ANTHROPIC_STRICTNESS` 覆盖。

## 期3实现与验证边界

- Provider 保留 `BaseVisionClient` + `CustomClient`（OpenAI 兼容）+ `AnthropicClient`（Anthropic Messages）：统一图片数预检、日志、错误脱敏共享；请求/响应构造按协议覆写。工具层只依赖 `VisionClient.analyze()` 契约，不感知协议。
- 明确区分环境变量中的连接配置与代码内 capability profile；项目不保存连接 profile。
- 工具层只使用 `VisionClient.analyze({ images, systemPrompt, userPrompt, thinking })`。
- 已修复 `assertPathInAllowedDirs` 的同级路径前缀绕过，改用 `path.relative` 判断并补了 Windows/Posix 回归测试。
- 已修复 POSIX 路径被错误转小写的问题；Linux/macOS 保持大小写敏感，Windows 保持大小写不敏感。
- 远程图片加载支持注入 DNS/HTTP 依赖，确定性测试已锁定私网拒绝、禁用重定向和 DNS 解析结果固定行为。
- logger 与 Provider 错误会统一脱敏 API key、Authorization、token、secret/password 和 Data URI/base64，包括 JSON 字符串形式。
- Provider 契约覆盖 custom endpoint/header、统一 Bearer、system prompt 模式、mimo-v2.5 五图能力、错误归一化与脱敏；配置测试覆盖数值边界和非法布尔值。
- `npm run test:phase3-mimo` 会先执行 build，避免真实回归误用旧构建产物。
- MCP 工具注册已迁移至 `registerTool + outputSchema`，不再依赖 `as never` 类型兼容 cast。

## 下一步

1. 扩充 manifest：小字 UI、密集表格、图表、复杂错误、字幕、屏幕录制、场景切换和短暂事件；每类样本至少运行多次后再比较策略。
2. 基于基准结果继续强化专项工具的证据约束；UI diff 后续可评估低成本像素热区辅助，但不提前引入通用组件检测。
3. 当前保持 Zoom 默认关闭；动态裁剪链路已 live 通过，只有在扩展基准中稳定提高细节召回后才考虑默认开启。
4. 暂不扩展 clipboard/latest、grounding、音频、长视频、远程视频或 Provider 自动路由；未来恢复内置 provider 时重新建立实现与 live-probe 兼容性矩阵。
5. Anthropic 协议后续：在小米 MiMo、智谱等其他 Anthropic 兼容端点上补充真实验收样本；评估长输出工具（ui_to_artifact_code/extract_text）在开思考时的等长输出对照；考虑对密集视觉任务提供 thinking 开关的细粒度 profile。

## 文档入口

- 开发协作规则：`AGENTS.md`。
- 文档导航：`docs/README.md`。
- 项目使用说明：`README.md`。
- 视觉质量基准：`docs/QUALITY_BENCHMARK.md`。
- 2026-07-21 超时复盘：`docs/visionkit-mcp-timeout-issue-2026-07-21.md`。
- 历史进度与已完成计划：`docs/archive/`。
- 设计与计划：`docs/superpowers/`。
