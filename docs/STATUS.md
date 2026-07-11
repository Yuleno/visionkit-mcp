# VisionKit MCP 当前状态

> 当前状态的唯一事实源。阶段、验收结果、已知问题或下一步发生变化时，只更新本文件。
> 最近更新：2026-07-11。

## 当前阶段

- 期1完成：仓库初始化、命名迁移、测试骨架和安全基线。
- 期2完成：7个专项工具、双策略、专项 prompts 和 structuredContent。
- 期2真实 MCP 验收完成：7个工具均通过 custom provider（mimo-v2.5）实际调用。
- 当前位于期3设计与规划前；期3尚未开始。

## 已验证状态

- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm run test:unit`：10个测试文件、62个用例通过。
- `npm run test:local`：mimo-v2.5 + 5图多裁剪端到端调用成功。
- MCP `tools/list`：返回7个工具，不包含已移除的 `image_understand` 和尚未实现的 video 工具。
- MCP `callTool`：`image_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_to_artifact`、`ui_diff_check` 全部真实调用成功。

## 当前运行约定

- 开发期连接 profile：项目根目录 `.visionkit-mcp/config.json`。
- 开发日志：项目根目录 `.visionkit-mcp/logs/`。
- `.visionkit-mcp/` 已被 Git 忽略，配置包含 API key，不能提交。
- `VISIONKIT_CONFIG_FILE` 可覆盖默认连接 profile 路径。
- 真实模型调用会消耗 API，执行前必须获得用户确认。

## 期3边界与已知问题

- 期3目标：Provider 重构、能力 profile、security 抽离和日志脱敏。
- 明确区分连接 profile（`connectionProfile`）与能力 profile（`capabilityProfile`）。
- 当前仍使用 `VisionClient.analyzeImage(imageData, prompt, enableThinking) => string`；新接口留到期3设计确认后实现。
- `assertPathInAllowedDirs` 存在同级路径前缀绕过风险，期3应改用 `path.relative` 等可靠边界判断并补测试。
- `index.ts` 仍有 SDK 类型兼容的 `as never`，期3可结合 `registerTool` 与 output schema 消除。
- DetailProfile 跨模块重复、system prompt 临时拼入 user prompt 等问题留待期3统一处理。

## 下一步

1. 阅读 `docs/superpowers/specs/2026-07-09-visionkit-mcp-design.md` 的 Provider 设计、期3路线和发布门槛。
2. 在现有总设计基础上编写期3专项设计，先确认两个 profile 的命名和边界。
3. 验证5个内置 provider 的默认模型 capabilities、system prompt 方式和 thinking 三态 payload；这是期3合并前的发布门槛。
4. 设计获批后再编写期3实施计划，不提前实现期4、期5内容。

## 文档入口

- 开发协作规则：`AGENTS.md`。
- 文档导航：`docs/README.md`。
- 项目使用说明：`README.md`。
- 历史进度与已完成计划：`docs/archive/`。
- 设计与计划：`docs/superpowers/`。
