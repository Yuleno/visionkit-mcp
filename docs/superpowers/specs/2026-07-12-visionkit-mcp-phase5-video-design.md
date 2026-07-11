# VisionKit MCP 期5专项设计：视频分析

> 状态：已自审；首版范围确认
> 日期：2026-07-12

## 1. 决策

期5首版只实现 `video_analysis` 的“本地视频均匀抽帧→现有多图视觉模型”路径。clipboard/latest 与 grounding 暂缓：前者平台与隐私成本高、MCP 调用方已能传路径；后者缺少内置 Provider live 能力证据。

不把 FFmpeg 二进制打进 npm 包。`ffmpeg-static` 会在安装时下载平台二进制，并带来显著体积及再分发许可证责任；ffmpeg.wasm 更适合浏览器且核心文件较大。首版使用用户安装的 FFmpeg，通过 `VISIONKIT_FFMPEG_PATH` / `VISIONKIT_FFPROBE_PATH` 或 PATH 定位。

## 2. 输入与安全边界

首版仅接受本地文件，不接受 URL、Data URI、目录或设备。支持 `.mp4`、`.webm`、`.mov`、`.mkv`；先 `realpath`，再复用允许目录边界，最后按真实路径 `stat`。

硬限制：默认最大100MB、最大120秒、最多5帧；环境变量只能向下收紧。ffprobe/ffmpeg 使用 `spawn(file,args)`，不经过 shell，不拼接用户参数；单次探测10秒、抽帧30秒超时。临时目录使用 `mkdtemp`，无论成功失败均在 `finally` 清理。

## 3. 抽帧与模型请求

使用 ffprobe JSON 获取 duration。帧数为 `min(config.maxFrames, capability.maxImages)`，且视频工具只在 `maxImages >= 2` 时注册。采样点使用每个等分区间的中点，避免片头/片尾黑帧：`t_i = duration * (i + 0.5) / n`。

每帧由 FFmpeg 输出为最长边1280的 JPEG，质量固定，不允许放大。模型请求图片顺序即时间顺序，user prompt 前附时间戳图例。structuredContent 继续返回既有字段，`detailProfile="video"`、`rounds=1`，warning 包含实际采样帧数与缺帧信息。

首版不处理音轨、字幕、镜头检测、原生视频上传或 Agentic Zoom。未来扩展必须保持抽帧路径作为通用降级。

## 4. 模块边界

- `src/media/video-frames.ts`：路径校验、ffprobe、采样时间、FFmpeg runner、临时文件清理。
- `src/tools/video-handler.ts`：构造时间图例、调用现有 `VisionClient.analyze`、生成标准 structuredContent。
- `ToolDef` 新增 `video_analysis`，`requiredCapabilities.minImages=2`。
- `src/index.ts` 对 video 使用专用 handler，其余7工具不变。

外部进程通过可注入 runner 测试，不在单元测试中要求系统安装 FFmpeg。

## 5. 验收

- 纯函数：均匀时间点、帧数上限、非法 duration。
- 安全：扩展名、越界路径、大小限制、无 shell、超时与清理。
- handler：图例顺序、图片预算、warnings、错误响应。
- 回归：原7工具、typecheck、unit、build、pack。
- live：本机具备 FFmpeg 后，使用无敏感内容短视频抽帧，再经用户授权调用 mimo-v2.5。缺少 FFmpeg 时不得声称 live 完成。

## 6. 自审结论

首版不绑定二进制、不接受远程视频、不开放自由 FFmpeg 参数，能控制供应链、SSRF、命令注入和资源消耗风险。代价是用户必须自行安装 FFmpeg；README 必须给出明确检测与错误说明。该范围可以进入编码。
