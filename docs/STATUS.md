# VisionKit MCP 当前状态

> 当前状态的唯一事实源。阶段、验收结果、已知问题或下一步发生变化时，只更新本文件。
> 最近更新：2026-07-12。

## 当前阶段

- 期1完成：仓库初始化、命名迁移、测试骨架和安全基线。
- 期2完成：7个专项工具、双策略、专项 prompts 和 structuredContent。
- 期2真实 MCP 验收完成：7个工具均通过 custom provider（mimo-v2.5）实际调用。
- 期3核心实现及 custom provider（mimo-v2.5）真实回归完成：统一 Provider 架构、capability profile、安全模块与日志脱敏已落地。
- 期3的五家内置 provider live probe 尚未执行（当前无对应凭据），因此尚未满足其发布门槛；不能宣称这些模型的多图与 thinking payload 已真实验证。
- 期4 Agentic Zoom 核心实现完成，默认关闭；自动化验证及 mimo-v2.5 首次开关对照已完成。
- 期5首版 `video_analysis` 完成：本地FFmpeg均匀抽帧路径、专用prompt/handler、安全预算及mimo-v2.5真实验收已落地；clipboard/latest与grounding继续暂缓。

## 已验证状态

- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm run test:unit`：16个测试文件、128个用例通过（含视频采样、安全限制、配置硬上限、fake runner与handler契约）。
- 期3实现后 `npm run typecheck`、`npm run build` 均通过。
- `npm run test:local`：mimo-v2.5 + 5图多裁剪端到端调用成功。
- MCP `tools/list`：mimo-v2.5 返回8个工具，新增 `video_analysis`；单图能力Provider因 `minImages=2` 不注册视频工具。
- MCP `callTool`：`image_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_to_artifact`、`ui_diff_check` 全部真实调用成功。
- 期3真实回归：通过 `npm run test:phase3-mimo` 启动重构后的 MCP server，以 mimo-v2.5 逐个调用上述 7 个工具全部成功；`ui_diff_check` 的双图请求成功。
- `npm pack --dry-run`：通过；发布包只包含 NOTICE、README、package.json 与 build 产物，不包含测试、开发配置或密钥。
- 最新 build 的 MCP 启动与 `tools/list` 冒烟通过；mimo-v2.5 能力下完整返回8个工具。
- 期4真实对照：以 `imageTest/deepswe.png` 调用 OCR 工具，关闭/开启 Zoom 各执行1次。两次均为 `rounds=1`，mimo-v2.5 在开启时直接返回 final，未请求动态裁剪；两份 OCR 结果完整度基本一致。因此继续保持默认关闭，且动态裁剪分支尚不能标记为 live 验收完成。
- 期4.1动态裁剪验收：自动生成4000×4000合成仪表盘，通过手动验收脚本注入右下角 `(2,2)` 决策，真实执行 LoadedMedia→3×3裁剪→mimo-v2.5 最终调用；返回正确验证码 `VK7Q-29MX-4P8R`、`rounds=2`，动态裁剪与最终调用链 live 通过。该结果不代表自动规划器一定会主动选择 Zoom。
- 修复 capability override 空值覆盖：未设置 `VISIONKIT_MAX_IMAGES` 等变量时不再以 `undefined` 覆盖模型 profile；mimo-v2.5 的运行时 `maxImages` 已恢复为5。
- 期5视频真实验收：FFmpeg 8.1.2从6.2秒合成视频均匀抽取5帧，mimo-v2.5准确输出红→绿→蓝时间线；`detailProfile=video`、`rounds=1`，仅产生1次API调用。
- GitHub Actions CI已加入 Node 22 的 Ubuntu/Windows矩阵；checkout/setup-node v5复验后两端均通过，无旧Node运行时弃用警告。
- `npm ci` 干净安装通过；同时修复了旧锁文件缺失的 Sharp `@emnapi/*` 可选依赖元数据，CI安装路径已在本机预演。

## 当前运行约定

- 开发期连接 profile：项目根目录 `.visionkit-mcp/config.json`。
- 开发日志：项目根目录 `.visionkit-mcp/logs/`。
- `.visionkit-mcp/` 已被 Git 忽略，配置包含 API key，不能提交。
- `VISIONKIT_CONFIG_FILE` 可覆盖默认连接 profile 路径。
- 真实模型调用会消耗 API，执行前必须获得用户确认。

## 期3实现与验证边界

- Provider 已迁移到 `src/providers/`：`BaseVisionClient` 统一图片数预检、system prompt、响应解析和错误脱敏；6 个子类只保留 transport 与 thinking 差异。
- 明确区分 connection profile（项目内配置文件，保存连接和鉴权）与 capability profile（代码内模型能力声明）。
- 当前工具层使用 `VisionClient.analyze({ images, systemPrompt, userPrompt, thinking })`；`analyzeImage` 仅作为旧测试脚本兼容入口保留。
- 已修复 `assertPathInAllowedDirs` 的同级路径前缀绕过，改用 `path.relative` 判断并补了 Windows/Posix 回归测试。
- 已修复 POSIX 路径被错误转小写的问题；Linux/macOS 保持大小写敏感，Windows 保持大小写不敏感。
- 远程图片加载支持注入 DNS/HTTP 依赖，确定性测试已锁定私网拒绝、禁用重定向和 DNS 解析结果固定行为。
- logger 与 Provider 错误会统一脱敏 API key、Authorization、token、secret/password 和 Data URI/base64，包括 JSON 字符串形式。
- Provider 契约已覆盖六家 endpoint/header、thinking 三态、custom 鉴权模式、SiliconFlow token 截断、错误归一化及 capability override 合法/非法值。
- `npm run test:phase3-mimo` 会先执行 build，避免真实回归误用旧构建产物。
- 保留的已知限制：MCP SDK handler 的 `as never` 类型兼容 cast 仍在，需后续 SDK API 适配时再消除。

## 下一步

1. 当前保持 Zoom 默认关闭；动态裁剪链路已 live 通过，但自动规划器在何时选择 Zoom 仍需更多样本评估。
2. 观察 GitHub Actions 首次运行结果；若跨平台全绿，再评估视频镜头检测/字幕等增量，不立即实现clipboard/latest或grounding。
3. 五家内置 provider 的 live probe 继续作为发布前兼容性矩阵；完成前不得提升其保守默认值。

## 文档入口

- 开发协作规则：`AGENTS.md`。
- 文档导航：`docs/README.md`。
- 项目使用说明：`README.md`。
- 历史进度与已完成计划：`docs/archive/`。
- 设计与计划：`docs/superpowers/`。
