# AGENTS.md

本文件记录 `visionkit-mcp` 的本地协作约定。只放项目特有规则，不重复说明通用编码习惯。

## 工作语言

- 与用户沟通默认使用中文。
- 新增项目文档、实施计划、设计说明优先使用中文。
- Git commit message 使用中文描述，保留常见前缀即可，例如 `feat: 增加交互式 custom provider 配置`。

## Git 规则

- 本项目以本地开发为主，不提交远程。
- 不执行 `git push`、不创建远程 PR，除非用户明确要求。
- 可以在用户要求时创建本地 commit，commit message 使用中文。
- 工作区可能存在用户未提交改动，严禁回滚、覆盖或清理非本人改动。
- 不使用 `git reset --hard`、`git checkout -- <file>` 等破坏性命令，除非用户明确指定。

## 当前阶段

- 期1已完成：项目初始化、命名迁移、基础测试、安全逻辑抽取与回归测试。
- `npm run configure` 交互式 custom provider 配置功能已落地并验证，相关文件是 `src/profile-config.ts`、`src/configure-cli.ts`、`src/config.ts`。
- 期2已完成：MCP 工具从单一 `image_understand` 演进为 7 个专项工具，入口为 `src/tools/definitions.ts`、`src/tools/handler.ts`、`src/tools/prompts.ts`。
- 期2仍沿用当前 `VisionClient.analyzeImage(imageData, prompt, enableThinking) => string` 接口；provider 新接口与能力 profile 重构留到期3。
- 进入期3前，先让用户用真实 MCP 客户端测试 7 个工具的实际效果。

## 路径提醒

- 当前仓库路径：`E:\MyProjects\visionkit-mcp`。
- 期2计划和设计文档目前位于另一个本地目录：
  - `E:\MyProjects\luma-mcp\docs\superpowers\plans\2026-07-09-visionkit-mcp-phase2.md`
  - `E:\MyProjects\luma-mcp\docs\superpowers\specs\2026-07-09-visionkit-mcp-design.md`
- 当前仓库暂时没有 `docs/` 目录。继续扩展前，应先确认是否需要把相关文档复制或迁移到本仓库。

## 开发边界

- 修改时优先保持现有 TypeScript ESM 风格和模块边界。
- 不提前实现期3、期4、期5内容，除非用户明确要求。
- 期2可以新增工具层、prompt 层、detail strategy 和 structured response，但不要顺手重构 provider 层大接口。
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
- `npm run configure` 会写入用户目录 `.visionkit-mcp/config.json`，该文件包含 API key，不能提交；不要把它当作普通验证命令主动运行，除非用户明确要求配置模型。

## 验证要求

- 普通代码改动至少运行 `npm run typecheck` 和相关单元测试。
- 涉及构建产物或入口行为时运行 `npm run build`。
- 涉及真实模型调用时，先确认用户是否希望消耗 API 调用。
- 如果测试或构建未运行，最终回复必须明确说明原因。

## 配置概念

- 连接 profile：当前已实现，用于 custom provider 的连接信息，例如 `baseUrl`、`model`、`apiKey`、`authHeader`。
- 能力 profile：计划在期3引入，用于描述模型能力，例如最大图片数、system prompt 支持方式、thinking 支持等。
- 后续命名应尽量区分 `connectionProfile` 与 `capabilityProfile`，避免混淆。
