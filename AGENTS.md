# AGENTS.md

本文件记录 `visionkit-mcp` 的本地协作约定。只放项目特有规则，不重复说明通用编码习惯。

## 工作语言

- 与用户沟通默认使用中文。
- 新增项目文档、实施计划、设计说明优先使用中文。
- Git commit message 使用中文描述，保留常见前缀即可，例如 `feat: 增加交互式 custom provider 配置`。

## Git 规则

- 本项目已关联 GitHub 仓库 `MasterSapphireStar/visionkit-mcp`。
- 不执行 `git push`、不创建远程 PR，除非用户明确要求。
- 可以在用户要求时创建本地 commit，commit message 使用中文。
- 工作区可能存在用户未提交改动，严禁回滚、覆盖或清理非本人改动。
- 不使用 `git reset --hard`、`git checkout -- <file>` 等破坏性命令，除非用户明确指定。

## 当前阶段

- 期1已完成：项目初始化、命名迁移、基础测试、安全逻辑抽取与回归测试。
- `npm run configure` 交互式 custom provider 配置功能已落地并验证，相关文件是 `src/profile-config.ts`、`src/configure-cli.ts`、`src/config.ts`。
- 期2已完成：MCP 工具从单一 `image_understand` 演进为 7 个专项工具，入口为 `src/tools/definitions.ts`、`src/tools/handler.ts`、`src/tools/prompts.ts`。
- 期2仍沿用当前 `VisionClient.analyzeImage(imageData, prompt, enableThinking) => string` 接口；provider 新接口与能力 profile 重构留到期3。
- 期2真实 MCP 验收已完成：7 个工具均通过 custom provider（mimo-v2.5）实际调用，单测为 10 个测试文件、62 个用例全绿。
- 当前处于期3设计与规划前；期3尚未开始，不应直接修改 provider 大接口。
- 2026-07-11 完成开发期配置调整：连接 profile 和日志统一写入项目内 `.visionkit-mcp/`，不创建用户主目录下的同名目录。

## 路径提醒

- 当前仓库路径：`E:\Workspace\03-visionkit-mcp`。
- 期1、期2计划及总设计均已位于当前仓库的 `docs/superpowers/`。
- `docs/README_EN.md` 来自绿盾加密环境，当前仍是不可读二进制文件；未确认可恢复性前不要覆盖或删除。

## 开发边界

- 修改时优先保持现有 TypeScript ESM 风格和模块边界。
- 期3开工前先基于现有总设计补充期3设计和实施计划，尤其明确 `connectionProfile` 与 `capabilityProfile`。
- 不提前实现期4、期5内容，除非用户明确要求。
- `image-processor.ts` 是关键路径，涉及图片读取、压缩、多裁剪、缓存和安全校验；改动必须小心并配测试。

## 常用命令

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:local <image-path-or-url> [question]
npm run configure
```

说明：

- `npm run test:unit` 运行 vitest 单元测试。
- `npm run test:local` 会调用真实模型，需要可用 API key。
- `npm run configure` 会写入项目根目录 `.visionkit-mcp/config.json`，日志写入 `.visionkit-mcp/logs/`；整个目录已被 Git 忽略。
- 配置文件包含 API key，不能提交；不要把 `npm run configure` 当作普通验证命令主动运行，除非用户明确要求配置模型。
- `VISIONKIT_CONFIG_FILE` 可覆盖默认连接 profile 路径。

## 验证要求

- 普通代码改动至少运行 `npm run typecheck` 和相关单元测试。
- 涉及构建产物或入口行为时运行 `npm run build`。
- 涉及真实模型调用时，先确认用户是否希望消耗 API 调用。
- 如果测试或构建未运行，最终回复必须明确说明原因。

## 配置概念

- 连接 profile：当前已实现，用于 custom provider 的连接信息，例如 `baseUrl`、`model`、`apiKey`、`authHeader`。
- 能力 profile：计划在期3引入，用于描述模型能力，例如最大图片数、system prompt 支持方式、thinking 支持等。
- 后续命名应尽量区分 `connectionProfile` 与 `capabilityProfile`，避免混淆。
