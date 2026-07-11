# VisionKit MCP 期5实施计划：视频分析

> 状态：首版实施、自动验证与mimo-v2.5真实验收完成

1. 新增可注入的本地视频校验、ffprobe 与均匀抽帧模块。
2. 新增 `video_analysis` 定义、prompt 和专用 handler，保持现有图片 handler 不变。
3. 增加配置上限与 README 的 FFmpeg 安装/检测说明。
4. 补齐纯逻辑、安全、runner 和 handler 单元测试。
5. 运行 typecheck、unit、build、pack；若本机无 FFmpeg，只记录自动验证，不伪造 live 结果。

## 完成证据

- FFmpeg 8.1.2本地抽取6.2秒合成视频的5个时间帧。
- mimo-v2.5单次真实调用正确识别红→绿→蓝时间线。
- `video_analysis` structuredContent 返回 `detailProfile=video`、`rounds=1`及抽帧warning。
- 16个测试文件、128个用例通过；typecheck与build通过。
- GitHub Actions Node 22矩阵在Ubuntu和Windows均通过。
