# VisionKit MCP 期6实施计划：质量基准与证据约束

> 状态：首版完成

1. 新增质量 manifest 和评分核心；为 OCR、技术图、报错、UI diff 写关键事实与格式规则。
2. 新增离线 CLI，读取已有对比报告并输出可比较的逐项与汇总分数。
3. 为评分器和 prompt 约束补单元测试；新增 `test:quality` 和 `test:quality:score` 脚本。
4. 强化专项 prompt 的事实/推断边界，不改工具输入 schema 或 provider 结构。
5. 运行 typecheck、unit、quality、build、pack；经授权运行真实对比，离线评分，并人工审查结果。
6. 更新状态、质量基准与使用文档，审查工作树后提交并推送。
