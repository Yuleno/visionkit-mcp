# VisionKit MCP 期4实施计划：Agentic Zoom

> 状态：核心实现、自动验证、首次开关对照及期4.1动态裁剪 live 链路验收完成。

## 任务 1：媒体加载边界

- 新建 `media/load-media.ts`，定义 `LoadedMedia`、可注入 `MediaLoader` 与一次安全加载实现。
- 将 image processor 的 source 读取、格式/大小/像素校验拆为加载与 buffer 编码两层，保留现有公开兼容函数。
- 单测本地、Data URI、远程 SSRF、符号链接和一次加载不变量。

## 任务 2：固定预处理迁移

- 令 `FixedMultiCropPreparation` 从 `LoadedMedia[]` 生成总览和固定裁切，不再自行读取 source。
- 保持 detail profile、UI diff 预算分配、缓存不污染与现有 prompt 顺序。
- 为单图、双图、overview 和缓存添加回归测试。

## 任务 3：Zoom 纯逻辑

- 新建 `tools/zoom-loop.ts`，实现 3×3 网格、重叠区域、decision Zod 解析、cell 去重与请求预算账本。
- 不在此模块调用 provider、sharp 或文件系统；用纯函数锁定边界、循环、预算和无效决策。

## 任务 4：Agentic 执行策略

- 在 `tools/execution-strategy.ts` 新增 `AgenticZoomExecution`，实现规划调用、原图 cell 裁切、最终调用、可计费重试和降级 warning。
- 维持 `SinglePassExecution`，并限制 Zoom 至四个候选工具和 `maxImages >= 2`。
- 契约测试 fake VisionClient：无 Zoom、Zoom 成功、重复/越界决策、解析失败、裁切失败、请求预算耗尽与 retry。

## 任务 5：配置、注册与文档

- 在 config 中严格解析 Zoom 开关和轮次，补齐 README 说明。
- 在 ToolDef 标记候选工具，在 handler 完成一次加载与 strategy 选择；不改 MCP 输入 schema。
- 更新 STATUS、设计/计划状态与文档导航。

## 任务 6：验证与人工对照

- 运行 `npm run typecheck`、`npm run test:unit`、`npm run build` 和 `npm pack --dry-run`。
- 用户确认后，以 mimo-v2.5 对至少一张小字/密集截图执行关闭/开启 Zoom 的候选工具 smoke，记录可读性、调用次数和 warning。
- 不将 Zoom 设为默认开启，除非人工对照结果获单独确认。

## 首次真实对照记录

- 图片：`imageTest/deepswe.png`；工具：`extract_text_from_screenshot`。
- Zoom 关闭与开启各调用一次 mimo-v2.5，共2次 API 调用。
- 两次均返回 `rounds=1`；开启后模型直接选择 final，没有产生动态裁剪和第二次调用。
- 两份 OCR 结果完整度基本一致，warning 均仅为 custom provider 忽略 thinking。
- 结论：保持默认关闭；本次证明开关路径可真实运行，但不作为动态裁剪分支 live 验收证据。

## 期4.1动态裁剪验收

- 自动生成4000×4000合成仪表盘，真实值为 `VK7Q-29MX-4P8R`。
- 手动验收模式只在脚本中注入 `(2,2)` Zoom 决策，生产执行、裁剪与 Provider 调用保持真实。
- mimo-v2.5 最终收到总览与右下角裁剪，返回正确值，structuredContent 为 `rounds=2`。
- 同期发现并修复空 capability override 覆盖 profile 的问题，mimo-v2.5 `maxImages` 恢复为5。
- 验收边界：动态裁剪链路 live 通过；自动规划器的主动触发质量仍需更多样本，Zoom 继续默认关闭。
