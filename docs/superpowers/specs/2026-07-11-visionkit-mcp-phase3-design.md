# VisionKit MCP 期3专项设计：Provider 与安全底座

> 状态：核心实施与 mimo-v2.5 真实回归完成；五家内置 provider live probe 待凭据
> 日期：2026-07-11
> 关联：`2026-07-09-visionkit-mcp-design.md` 第4、6节

## 目标与验证边界

期3将 provider 调用收敛为统一的 `VisionClient.analyze(request)` 契约，抽离安全边界并实现日志脱敏。当前只具备 custom provider 的 mimo-v2.5 可用凭据；已使用其完成重构后 MCP 的 7 工具真实回归，其他五家内置 provider 只做 fake transport 契约测试，不能标记为已完成 live probe。

## Provider 设计

- `src/providers/vision-client.ts` 定义 `VisionRequest`、`VisionResult`、`Capabilities` 和 `VisionClient`。
- `BaseVisionClient` 负责图片数预检、system prompt 的 native/merge-user 处理、HTTP 调用、响应提取和错误脱敏。
- 各 provider 子类只声明 transport、显示名和 `applyThinking` 差异。
- capabilities 由 `provider/model` profile 与 `VisionKitConfig.capabilityOverrides` 合并得到；未知模型回退为 `maxImages: 1` 与 `merge_user`。
- 已有真实验收的 `custom/mimo-v2.5` 登记 `maxImages: 5`；其余未 live 验证的内置模型保持保守上限。SiliconFlow 已知 system prompt 需合并到 user prompt。

## 配置概念

- **connectionProfile**：现有 `.visionkit-mcp/config.json` 的 `profiles`，只保存 custom provider 的 URL、模型、密钥和鉴权方式。
- **capabilityProfile**：代码内 `CAPABILITY_PROFILES`，描述 provider+model 能力，不保存密钥。
- 使用 `VISIONKIT_MAX_IMAGES`、`VISIONKIT_SYSTEM_PROMPT_MODE`、`VISIONKIT_NATIVE_VIDEO`、`VISIONKIT_TOOL_CALLING`、`VISIONKIT_GROUNDING` 可覆盖能力。所有环境变量仅在 `loadConfig()` 中读取一次。

## 安全与日志

- `media/security.ts` 提供路径边界与私网地址判断；路径判定使用 `path.relative`，拒绝同级前缀伪造。
- 保留 `security-utils.ts` 作为迁移兼容出口。
- logger 对对象、字符串和错误消息中的 API key、Authorization、Data URI/base64 作递归脱敏。
- POSIX 路径保持大小写敏感，Windows 路径保持大小写不敏感，避免大小写归一化导致跨平台目录误放行。

## 契约测试覆盖

- 六家 Provider 的 transport endpoint、request path 与鉴权 Header。
- Zhipu、Qwen、Volcengine、Hunyuan 的 thinking `true/false/undefined` 三态。
- SiliconFlow thinking warning 与 `max_tokens <= 4096`。
- custom 的 bearer、x-api-key、自定义 Header 以及三种 thinking mode。
- 图片数量上下限、native/merge-user system prompt、空响应、错误归一化，以及对象/普通字符串/JSON 字符串中的敏感信息脱敏。
- 五个 capability override 环境变量的合法值与非法值。
- Windows/POSIX 路径边界、同级前缀伪造和 POSIX 大小写敏感性。

## 发布门槛

在取得五家内置模型凭据前，不能宣称它们的多图、system prompt 或 thinking payload 已真实验证；未来需为每家执行 live probe，补齐 profile 后才可提升默认能力上限。
