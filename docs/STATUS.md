# VisionKit MCP 当前状态

> 当前状态的唯一事实源。阶段、验收结果、已知问题或下一步发生变化时，只更新本文件。
> 最近更新：2026-07-11。

## 当前阶段

- 期1完成：仓库初始化、命名迁移、测试骨架和安全基线。
- 期2完成：7个专项工具、双策略、专项 prompts 和 structuredContent。
- 期2真实 MCP 验收完成：7个工具均通过 custom provider（mimo-v2.5）实际调用。
- 期3核心实现及 custom provider（mimo-v2.5）真实回归完成：统一 Provider 架构、capability profile、安全模块与日志脱敏已落地。
- 期3的五家内置 provider live probe 尚未执行（当前无对应凭据），因此尚未满足其发布门槛；不能宣称这些模型的多图与 thinking payload 已真实验证。

## 已验证状态

- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm run test:unit`：12个测试文件、105个用例通过（含完整 Provider fake transport、capability override、错误脱敏、跨平台路径以及远程图片 SSRF 契约测试）。
- 期3实现后 `npm run typecheck`、`npm run build` 均通过。
- `npm run test:local`：mimo-v2.5 + 5图多裁剪端到端调用成功。
- MCP `tools/list`：返回7个工具，不包含已移除的 `image_understand` 和尚未实现的 video 工具。
- MCP `callTool`：`image_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_to_artifact`、`ui_diff_check` 全部真实调用成功。
- 期3真实回归：通过 `npm run test:phase3-mimo` 启动重构后的 MCP server，以 mimo-v2.5 逐个调用上述 7 个工具全部成功；`ui_diff_check` 的双图请求成功。
- `npm pack --dry-run`：通过；发布包只包含 NOTICE、README、package.json 与 build 产物，不包含测试、开发配置或密钥。
- 最新 build 的 MCP 启动与 `tools/list` 冒烟通过，完整返回7个工具。

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

1. 获取五家内置 provider 中任意可用凭据后，逐家执行默认模型的 live probe，补齐 `CAPABILITY_PROFILES` 的 `maxImages`、system prompt 和 thinking 验证；完成前不得提升其保守默认值。
2. 完成上述验证后，归档期3设计与计划，再评估是否启动期4 Agentic Zoom；不提前实现期4、期5内容。

## 文档入口

- 开发协作规则：`AGENTS.md`。
- 文档导航：`docs/README.md`。
- 项目使用说明：`README.md`。
- 历史进度与已完成计划：`docs/archive/`。
- 设计与计划：`docs/superpowers/`。
