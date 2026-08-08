# AGENTS.md

本文件是给代理的协作约定。核心原则：**`docs/STATUS.md` 是项目当前状态的唯一事实源**——阶段、验收、已知问题、下一步都以它为准。开始任何开发前先读它；涉及具体设计时再读 `docs/superpowers/` 下对应文档。

## 沟通与 Git

- 与用户沟通、写文档、写 commit message 默认用中文。
- 默认允许 `git commit` 与 `git push`。创建远程 PR 前先与用户确认。
- 不覆盖、不清理用户未提交的改动；不使用破坏性 git 命令（`reset --hard`、`checkout --` 等），除非用户明确指定。

## 开发边界

- Provider 层只保留 `BaseVisionClient` + `CustomClient`（OpenAI 兼容）+ `AnthropicClient`（Anthropic Messages）；连接配置（环境变量）与能力 profile（代码内 `CAPABILITY_PROFILES`）分离。
- 工具层只通过 `VisionClient.analyze({ images, systemPrompt, userPrompt, thinking })` 契约与 Provider 交互，不感知协议。
- 图片关键路径位于 `src/media/`（image-source / image-transform / image-crop / prepare-image），改动必须配相关测试。
- 未知模型保持保守能力默认值，不凭猜测放宽 `maxImages` 或 system/thinking 行为。

## 验证

- 普通改动至少运行 `npm run typecheck` 和相关单元测试。
- 涉及构建产物或入口行为时运行 `npm run build`。
- 具体命令以 `package.json` scripts 为准；会调用真实模型、消耗 API 额度的命令，运行前先向用户确认。
- 若测试或构建未运行，最终回复必须明确说明原因。
