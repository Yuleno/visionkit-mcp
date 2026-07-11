# VisionKit MCP 项目内开发配置设计

## 背景

当前 `npm run configure` 默认把包含 API Key 的连接 profile 写入用户主目录下的 `.visionkit-mcp/config.json`。项目仍处于本地开发阶段，尚未作为通用工具发布；现阶段把配置放在项目内部更容易发现、备份和调试，也能避免在用户主目录提前创建应用目录。

## 目标

- 开发阶段默认把配置保存到项目根目录的 `.visionkit-mcp/config.json`。
- MCP 服务、`npm run test:local` 与 `npm run configure` 使用同一套默认路径解析逻辑。
- 保留 `VISIONKIT_CONFIG_FILE`，使显式路径始终拥有最高优先级。
- 继续通过 `.gitignore` 排除 `.visionkit-mcp/`，避免 API Key 被提交。
- 开发阶段的日志也写入项目内，保证运行项目时不会创建用户主目录下的 `.visionkit-mcp`。
- 不在本次改动中引入系统凭据存储或设计发布阶段的用户级配置目录。

## 路径规则

默认配置路径为：

```text
<process.cwd()>/.visionkit-mcp/config.json
```

当前阶段要求从项目根目录运行开发命令。选择 `process.cwd()` 而不是根据编译产物位置反推仓库，是为了让源码运行和构建产物运行遵循相同、明确且易于测试的规则。

最终路径优先级为：

1. `VISIONKIT_CONFIG_FILE` 指定的路径。
2. 当前工作目录下的 `.visionkit-mcp/config.json`。

默认日志目录为：

```text
<process.cwd()>/.visionkit-mcp/logs
```

## 代码边界

`src/profile-config.ts` 继续负责计算默认配置路径、读写配置和解析 profile。默认路径函数改为基于当前工作目录，避免调用方各自拼接路径。

`src/configure-cli.ts` 与 `src/config.ts` 继续复用该函数。除了默认路径变化，不改变 profile 格式、环境变量优先级或 Provider 行为。

`src/utils/logger.ts` 使用当前工作目录计算项目内日志目录，不再调用 `homedir()`。日志文件名和写入失败时降级到 stderr 的行为保持不变。

## 错误处理与安全

- 写配置时继续递归创建 `.visionkit-mcp` 目录。
- JSON 读取或解析失败时维持当前错误行为，不在本次范围内增加自动修复。
- API Key 仍以明文保存在本地 JSON 中；README 必须明确该文件不可提交。
- `.gitignore` 已包含 `.visionkit-mcp/`，测试应验证该约定仍存在或至少不修改它。

## 测试与验证

- 为默认路径增加单元测试，验证它等于 `<cwd>/.visionkit-mcp/config.json`。
- 为默认日志目录增加单元测试，验证它等于 `<cwd>/.visionkit-mcp/logs`。
- 保留并运行现有 profile 与环境变量覆盖测试。
- 运行 `npm run typecheck`、`npm run test:unit` 和 `npm run build`。
- 不运行真实模型测试，不执行 `npm run configure`，避免生成真实配置或消耗 API。
- 完整测试不应再尝试创建用户主目录下的 `.visionkit-mcp`。

## 文档变更

README 中把默认保存位置从用户目录改为项目根目录下的 `.visionkit-mcp/config.json`，并说明：

- 当前行为面向本地开发阶段。
- 命令需要从项目根目录执行。
- 可用 `VISIONKIT_CONFIG_FILE` 覆盖路径。
- 配置包含 API Key，不能提交。

## 非目标与后续迁移

本次不实现用户级正式配置目录。项目准备发布时，再单独设计跨平台用户配置位置、旧配置迁移和密钥安全方案；届时不应默默改变现有用户配置，而应提供明确的兼容读取或迁移流程。
