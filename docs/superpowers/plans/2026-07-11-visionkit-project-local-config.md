# VisionKit MCP 项目内开发配置实施计划

> 依据设计：`docs/superpowers/specs/2026-07-11-visionkit-project-local-config-design.md`

## 目标

把开发阶段的默认连接 profile 路径从用户主目录改为当前工作目录下的 `.visionkit-mcp/config.json`，同时保留 `VISIONKIT_CONFIG_FILE` 覆盖能力。

## Task 1：用单元测试定义默认路径

**文件：**

- 修改：`test/unit/profile-config.test.ts`

**步骤：**

1. 导入 `getDefaultUserConfigPath` 与 `node:path` 的 `join`。
2. 添加测试，向路径函数传入一个明确的项目目录。
3. 断言返回 `<projectDir>/.visionkit-mcp/config.json`。
4. 运行该测试并确认它在实现修改前失败，失败原因必须是仍返回用户主目录路径。

## Task 2：实现项目内默认路径

**文件：**

- 修改：`src/profile-config.ts`

**步骤：**

1. 移除不再使用的 `homedir` 导入。
2. 让 `getDefaultUserConfigPath` 接受默认值为 `process.cwd()` 的可选基准目录。
3. 返回 `<baseDir>/.visionkit-mcp/config.json`。
4. 运行 `test/unit/profile-config.test.ts`，确认新增测试与现有 profile 测试通过。

## Task 3：同步使用文档

**文件：**

- 修改：`README.md`
- 修改：`HANDOFF.md`

**步骤：**

1. 把 `npm run configure` 的默认保存位置改为项目根目录下的 `.visionkit-mcp/config.json`。
2. 说明开发命令需从项目根目录运行。
3. 说明 `VISIONKIT_CONFIG_FILE` 可覆盖默认位置。
4. 保留配置包含 API Key、不得提交的安全提醒。
5. 更新交接文档中关于用户目录配置的旧描述。

## Task 4：完整验证

**步骤：**

1. 运行 `npm run typecheck`。
2. 运行 `npm run test:unit`。
3. 运行 `npm run build`。
4. 运行 `git diff --check`。
5. 检查 `git status --short`，确认没有生成 `.visionkit-mcp/config.json`，也没有无关文件被修改。

不运行 `npm run configure` 和真实模型测试，避免写入真实 API Key 或产生模型调用费用。
