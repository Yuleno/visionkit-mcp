# AGENTS.md

本文件记录 `visionkit-mcp` 的本地协作约定。只放项目特有规则，不重复说明通用编码习惯。

## 项目入口

- 当前状态与下一步：`docs/STATUS.md`（唯一事实源）。
- 文档导航：`docs/README.md`。
- 安装、配置和使用：`README.md`。
- 开始开发前先读本文件和 `docs/STATUS.md`；涉及具体期次时，再读对应的设计与实施计划。

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

- 期1、期2及7个工具的真实 MCP 验收已完成。
- 期3核心实现和 mimo-v2.5 的7工具真实回归已完成；五家内置 provider live probe 因缺少凭据尚未执行，能力保持保守默认值。
- 期4 Agentic Zoom 核心实现及期4.1动态裁剪 live 链路验收完成，仍默认关闭；自动规划器的主动触发质量需继续积累样本。
- 期5首版 video_analysis 已完成并通过 mimo-v2.5 真实验收；依赖本地 FFmpeg，clipboard/latest 与 grounding 暂缓。
- 期5.1智能关键帧与相邻画面去重已完成并通过短事件真实验收。
- 不把未完成 live probe 的内置模型标记为多图或 thinking 已真实验证。
- 详细验收结果、已知问题和下一步只维护在 `docs/STATUS.md`。

## 路径提醒

- 当前仓库路径：`E:\Workspace\03-visionkit-mcp`。
- 当前仍生效的总设计和期3专项设计位于 `docs/superpowers/specs/`，期3实施计划位于 `docs/superpowers/plans/`；已完成的期1、期2及配置调整文档位于 `docs/archive/`。

## 开发边界

- 修改时优先保持现有 TypeScript ESM 风格和模块边界。
- Provider 层已统一为 `BaseVisionClient` + 六个薄子类；继续修改时必须保持 `connectionProfile` 与 `capabilityProfile` 分离。
- 五家内置 provider 的能力 profile 只能在取得文档与 live probe 证据后提升，不凭猜测放宽 `maxImages` 或 system/thinking 行为。
- 不扩展期5的 clipboard/latest、grounding 或视频高级能力，除非用户明确要求。
- `image-processor.ts` 是关键路径，涉及图片读取、压缩、多裁剪、缓存和安全校验；改动必须小心并配测试。

## 常用命令

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:local <image-path-or-url> [question]
npm run test:phase3-mimo
npm run test:phase4-mimo [image-path]
npm run test:phase4-mimo:synthetic
npm run test:phase4-mimo:forced
npm run test:phase5-mimo [video-path]
npm run test:phase5-smart
npm run configure
```

说明：

- `npm run test:unit` 运行 vitest 单元测试。
- `npm run test:local` 会调用真实模型，需要可用 API key。
- `npm run test:phase3-mimo` 会先 build，再用 mimo-v2.5 真实调用7个 MCP 工具，会产生 API 消耗。
- `npm run test:phase4-mimo` 会将同一图片发送给 mimo-v2.5，执行 Agentic Zoom 关闭/开启对照，会产生 API 消耗。
- `test:phase4-mimo:synthetic` 使用无真实数据的合成图对照；`:forced` 仅用于动态裁剪 live 链路验收，手动注入网格决策。
- `npm run test:phase5-mimo` 会用本地FFmpeg抽帧并把帧发送给mimo-v2.5，会产生API消耗。
- `npm run test:phase5-smart` 会生成无敏感短事件视频并真实验证智能关键帧，会产生1次API调用。
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
- 能力 profile：期3已实现，代码内 `CAPABILITY_PROFILES` 描述最大图片数、system prompt 方式等模型能力，不保存密钥。
- 命名保持 `connectionProfile` 与 `capabilityProfile` 两个独立概念，避免混淆。
