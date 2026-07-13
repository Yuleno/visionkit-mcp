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

- 本项目已关联 GitHub 仓库 `Juvorix/visionkit-mcp`。
- 默认允许 `git commit` 与 `git push`（包括 force-push 这种 history rewrite 同步所需场景）；commit message 使用中文。
- 创建远程 PR 前先与用户确认。
- 工作区可能存在用户未提交改动，严禁回滚、覆盖或清理非本人改动。
- 不使用 `git reset --hard`、`git checkout -- <file>` 等破坏性命令，除非用户明确指定。

## 当前阶段

- 期1、期2及7个工具的真实 MCP 验收已完成。
- 期3核心实现和 mimo-v2.5 的7工具真实回归已完成；五家内置 provider live probe 因缺少凭据尚未执行，能力保持保守默认值。
- 期4 Agentic Zoom 核心实现及期4.1动态裁剪 live 链路验收完成，仍默认关闭；自动规划器的主动触发质量需继续积累样本。
- 期5首版 video_analysis 已完成并通过 mimo-v2.5 真实验收；依赖本地 FFmpeg，clipboard/latest 与 grounding 暂缓。
- 期5.1智能关键帧与相邻画面去重已完成并通过短事件真实验收。
- 期6质量基础设施与专项证据约束已完成首版；当前基准仅含4组图片样本，结论不得外推为模型的全面优劣。
- 期7 custom-only 配置收敛已完成，内置 5 家 provider 降级为 dormant。
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
npm run test:compare-zai
npm run test:compare-zai:ui-diff
npm run test:quality
npm run test:quality:score
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
- `test:compare-zai` 与 `test:compare-zai:ui-diff` 会同时消耗 mimo-v2.5 和智谱 API 额度，仅在用户明确授权后运行；结果写入已忽略的 `.visionkit-mcp/`。
- `test:quality` 与 `test:quality:score` 只运行离线 manifest/评分器，不消耗 API；后者读取已有对比报告。
- `npm run configure` 打印一段 stdio 配置片段到 stdout，不落盘、不打印真实 key；整个 `.visionkit-mcp/` 目录在期7后不再由该命令创建。
- 不要把 `npm run configure` 当作普通验证命令主动运行，除非用户明确要求配置模型。

## 验证要求

- 普通代码改动至少运行 `npm run typecheck` 和相关单元测试。
- 涉及构建产物或入口行为时运行 `npm run build`。
- 涉及真实模型调用时，先确认用户是否希望消耗 API 调用。
- 如果测试或构建未运行，最终回复必须明确说明原因。

## 配置概念

- custom-only：产品入口只有 custom provider，连接信息从 `VISIONKIT_API_KEY` / `VISIONKIT_BASE_URL` / `VISIONKIT_MODEL` 三个 env 读取，统一 `Authorization: Bearer`。旧的多 provider 与项目内配置文件已移除。
- 能力 profile：代码内 `CAPABILITY_PROFILES` 描述最大图片数、system prompt 方式等模型能力，不保存密钥。
- 内置五家 provider（zhipu/siliconflow/qwen/volcengine/hunyuan）的薄子类保留为 dormant，custom-only 模式下不触达；未来建立 live-probe 兼容性矩阵后再恢复注册。
- `npm run configure` 打印配置片段不落盘；不再写入 `.visionkit-mcp/config.json`。
