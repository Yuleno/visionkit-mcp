# visionkit-mcp 进度账本

> 当前仓库：`E:/Workspace/03-visionkit-mcp/`
> GitHub：`MasterSapphireStar/visionkit-mcp`
> 最近更新：2026-07-11

## 当前状态

- 期1：complete（仓库初始化、命名迁移、测试骨架、安全基线）。
- 期2：complete（7 个专项工具、双策略、专项 prompts、structuredContent）。
- 期2真实验收：complete（7 个工具均通过 mimo-v2.5 实际 callTool；10 个测试文件、62 个用例全绿）。
- 开发配置调整：complete（配置与日志统一写入项目内 `.visionkit-mcp/`）。
- 下一步：期3设计与规划；Provider 重构、能力 profile 与 security 抽离尚未开始。

## 期1完成记录

- Task 1: complete(复制 luma 源码到 E:/MyProjects/visionkit-mcp/,13 个 ts 文件 + test/6 个 + package.json/tsconfig/README)
- Task 2-4: complete(vitest v4.1.10 装好、vitest.config.ts、package.json 改名 visionkit-mcp/author jinyu、NOTICE 双方归属;review Approved)
  - Minor: npm registry 改 npmmirror + strict-ssl=false(环境 TLS workaround,未写入 package.json)
  - Minor: test:unit 无测试文件时 exit code 1(vitest 默认行为,后续有测试即消失)
- Task 5-9: complete(security-utils.ts 抽 isPrivateIP+assertPathInAllowedDirs 纯函数、image-processor 改 import 保留 isIPv6、22/22 回归测试全绿、LumaConfig→VisionKitConfig 全局改名含 test/;review Approved)
  - **期3 待修(安全)**:assertPathInAllowedDirs 测试用带尾斜杠 allowedDirs,但生产 loadImageBuffer 用 path.normalize 构造的不带尾斜杠,导致同级前缀伪造(如 project-evil vs project)能通过 startsWith 检查。luma 既有问题,期3 抽 security.ts 时修(改用 path.relative 或补尾斜杠)。
- Task 10-11: complete(README 头部改 VisionKit MCP+归属+期1进度、验收 typecheck/build/22-22 test/冒烟启动全过、build/ 已删)。**期1 全部完成。**
  - 待后续期次:源码 logger 字符串 "Luma MCP Server" 等未改名(期1 范围外)
- Task 12(收尾): complete(src/ 8 处 Luma→VisionKit、README 主体改名+死链清理、files 加 NOTICE、lockfile 重成、.gitignore;review Approved,归属引用完整保留)
  - Minor 残留(不影响交付):test/test-local.ts 2 处 "Luma MCP" 字符串(test/ 范围外,后续期次顺手改)

## 期2：专项工具层（已完成）

计划: docs/superpowers/plans/2026-07-09-visionkit-mcp-phase2.md
工作目录: E:/Workspace/03-visionkit-mcp/

- 期2-Task1: complete(PreparedImageInput.preferTextUsed + processImageVariants 提取复用 I/O;review Approved,31/31 绿)
- 期2-Task2: complete(prompts 模块 PREAMBLE 三铁律+7套 prompt+buildPrompt;PROMPT_KEYS 8 key;review Approved,37/37 绿)
  - Minor: PromptArgs.outputType 死字段(handler 用 key 驱动,冗余但不影响功能)
- 期2-Task3: complete(detail-strategy 类型+FixedMultiCropPreparation+validateItems;不变量不截断+budget 正确;review Approved,41/41 绿)
  - Minor 待 Task 6 修:detail-strategy 删 TEXT_HEAVY_PROMPT_PATTERN 死 import(auto 正则归 handler)
- 期2-Task4: complete(execution-strategy SinglePassExecution+composePrompt;systemPrompt 拼前缀期2 临时;review Approved,44/44 绿)
  - Minor:测试3 名误导/未验 prompt 参数(后续加固);execution-strategy 删未用 ResolvedDetailProfile import
- 期2-Task5: complete(definitions 7 TOOL_DEFS + createStructuredSuccessResponse;review Approved,50/50 绿)
  - Minor 待 Task 6:DetailProfile 跨模块重复(definitions+detail-strategy),统一用 detail-strategy 源;handler 补 auto 正则 + ui_to_artifact promptKey 切换
- 期2-Task6: complete(handler makeHandler 串联全链路 + auto 正则 + promptKey 切换 + structured 输出;review Approved,当时 59/59 绿)
- 期2-Task7: complete(index.ts 数据驱动注册 7 工具 + 删 image_understand + 死代码清理 + requiredCapabilities 校验;MCP tools/list=7 实测;review Approved,当时 59/59 绿)
  - Minor:`as never` cast(SDK 类型兼容,期3 registerTool+outputSchema 消除;运行时透传正常)
- 期2-Task8: complete(client-registry.ts 独立模块 + 消除 test-local/test-qwen 副本;review Approved,当时 59/59 绿)
- 期2-Task9: complete(期2结项时验收:typecheck/build/test 59/59 全绿;MCP tools/list 实测返回 7 工具无 image_understand/video;build/ 已删)

**期2 完成。** 7 个专项工具挂上 MCP,data驱动注册 + 双策略 + prompt 体系 + structuredContent 双输出。

## 2026-07-11：真实 MCP 验收与开发配置调整

- `npm run typecheck`、`npm run build`、`npm run test:unit` 全部通过；当前为 10 个测试文件、62 个用例。
- custom provider（mimo-v2.5）读取项目内连接 profile 成功，5 图多裁剪端到端调用成功。
- `image_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_to_artifact`、`ui_diff_check` 共 7 个工具逐个实际调用成功。
- 默认连接 profile 改为 `.visionkit-mcp/config.json`，日志改为 `.visionkit-mcp/logs/`；开发阶段不再创建用户主目录下的 `.visionkit-mcp`。
- Git 仓库重新初始化并关联 GitHub，当前以远程仓库作为版本历史来源。
