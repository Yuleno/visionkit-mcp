# VisionKit MCP

开源的视觉 MCP 服务。它把 OpenAI 兼容的视觉模型接入 Claude Code 或其他 MCP 客户端，用于截图、UI、OCR、报错、技术图、图表和本地短视频分析。

## 通过 npm 使用

推荐由 MCP 客户端通过 npm 拉取固定版本 `visionkit-mcp@1.6.1`。固定版本可避免上游更新影响现有配置；需要跟随最新版时可改用 `visionkit-mcp@latest`。

## 配置

### 前置要求

- Node.js >= 22.12（建议使用当前 LTS）
- 支持视觉输入、兼容 OpenAI Chat Completions 的模型 endpoint、API key 与模型名

VisionKit 只读取以下三项连接环境变量，并统一使用 `Authorization: Bearer` 鉴权：

| 变量 | 说明 |
| --- | --- |
| `VISIONKIT_API_KEY` | 模型服务的 API key |
| `VISIONKIT_BASE_URL` | OpenAI 兼容 endpoint；通常填到 `.../v1`，也支持完整的 `.../v1/chat/completions` |
| `VISIONKIT_MODEL` | 模型名称 |

### Claude Code（Windows）

当前工作区可直接使用以下命令。替换三处模型连接信息；如已存在同名服务，先执行 `claude mcp remove visionkit-mcp`。

**用户级**：本机所有 Claude Code 项目可用。

```powershell
claude mcp add visionkit-mcp --scope user --env VISIONKIT_API_KEY=YOUR_API_KEY --env VISIONKIT_BASE_URL=https://your-provider.example/v1 --env VISIONKIT_MODEL=your-model -- cmd /c npx -y visionkit-mcp@1.6.1
```

**项目级**：只在当前项目可用。

```powershell
claude mcp add visionkit-mcp --scope project --env VISIONKIT_API_KEY=YOUR_API_KEY --env VISIONKIT_BASE_URL=https://your-provider.example/v1 --env VISIONKIT_MODEL=your-model -- cmd /c npx -y visionkit-mcp@1.6.1
```

项目级配置会将 API key 写入项目的 `.mcp.json`。确认该文件已被忽略，且不要提交或分享包含真实 key 的配置。

### Claude Code（macOS / Linux / WSL）

以下命令适用于 macOS、Linux 与 WSL：

```bash
claude mcp add visionkit-mcp --scope user \
  --env VISIONKIT_API_KEY=YOUR_API_KEY \
  --env VISIONKIT_BASE_URL=https://your-provider.example/v1 \
  --env VISIONKIT_MODEL=your-model \
  -- npx -y visionkit-mcp@1.6.1
```

项目级配置只需将 `--scope user` 改为 `--scope project`。

### 其他 MCP 客户端

在客户端配置中使用 npm `npx` 入口：

```json
{
  "mcpServers": {
    "visionkit-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "visionkit-mcp@1.6.1"],
      "env": {
        "VISIONKIT_API_KEY": "YOUR_API_KEY",
        "VISIONKIT_BASE_URL": "https://your-provider.example/v1",
        "VISIONKIT_MODEL": "your-model"
      }
    }
  }
}
```

原生 Windows 客户端请把 `command` 改为 `cmd`，并把 `args` 改为 `["/c", "npx", "-y", "visionkit-mcp@1.6.1"]`。

### GitHub npx（备用）

需要直接使用 GitHub 标签时，可运行 `npx -y github:Yuleno/visionkit-mcp#v1.6.1`。npm 12 默认禁止 Git 依赖，需要显式改为 `npx --allow-git=all -y github:Yuleno/visionkit-mcp#v1.6.1`；因此日常使用优先选择 npm 包。

### 生成配置片段（可选）

在仓库根目录运行：

```powershell
npm run configure
```

命令会询问 endpoint、模型名和 API key，并打印 stdio 配置片段；不会写入文件，也不会将真实 API key 输出到屏幕。

### 本地构建（调试用）

需要直接运行当前工作区代码时：

```powershell
cd E:\Workspace\03-visionkit-mcp
npm install
npm run build
node .\build\index.js
```

此方式仍需在进程环境中提供三项必填的 `VISIONKIT_*` 变量。

## 能做什么

| 工具 | 用途 |
| --- | --- |
| `image_analysis` | 通用图片理解与问答 |
| `extract_text_from_screenshot` | OCR：代码、终端、文档与表格截图 |
| `diagnose_error_screenshot` | 从报错截图中定位原因并给出修复步骤 |
| `understand_technical_diagram` | 解读架构图、流程图、UML、ER 图和时序图 |
| `analyze_data_visualization` | 分析图表、仪表盘、趋势与异常 |
| `ui_to_artifact` | 从 UI 截图生成前端代码或设计规范 |
| `ui_diff_check` | 对比参考设计图与实际实现图 |
| `video_analysis` | 分析本地短视频的时间线和关键事件 |

`ui_diff_check` 与 `video_analysis` 需要模型至少支持两张图片输入。未知模型默认按单图处理，因此不会注册这两个工具；已由本项目真实验收的 `mimo-v2.5` 默认最多支持 5 张图片。

### 输入边界

- 图片可使用本地路径、HTTP(S) URL 或 Data URI；支持 JPG、PNG、WebP、GIF，最大 10MB。
- 超过 2MB 的图片会自动压缩；大图可生成原图加裁剪图，保留文字和局部细节。
- `video_analysis` 只接受本地 mp4、webm、mov、mkv，默认限制为 100MB、120 秒和最多 5 帧。
- 视频工具依赖本机可用的 FFmpeg 与 ffprobe，不会随依赖自动安装。

### 隐私与安全

- 图片、远程图片下载结果，以及视频抽出的最终 JPEG 帧会发送给 `VISIONKIT_BASE_URL` 指定的模型服务。不要把敏感内容发送给不可信的服务商。
- 项目会校验本地路径、远程地址和媒体格式；这不替代对模型服务商与网络环境的信任判断。
- API key 只应放在本机 MCP 客户端配置或环境变量中，不能提交到 Git。

## 高级配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_TOKENS` | `8192` | 最大生成 token 数 |
| `TEMPERATURE` | `0.7` | 模型温度 |
| `TOP_P` | `0.95` | 模型 top-p |
| `ENABLE_THINKING` | `true` | 是否请求模型思考能力 |
| `MULTI_CROP` | `true` | 是否为大图生成裁剪图 |
| `MULTI_CROP_MAX_TILES` | `5` | 原图加裁剪图的最大图片预算 |
| `BASE_VISION_PROMPT` | 内置默认值 | 自定义基础视觉提示词 |
| `VISIONKIT_MAX_IMAGES` | 按能力 profile | 覆盖模型最多可接收的图片数（正整数） |
| `VISIONKIT_SYSTEM_PROMPT_MODE` | 按能力 profile | `native` 或 `merge_user` |
| `VISIONKIT_NATIVE_VIDEO` | `false` | 覆盖模型原生视频能力（`true`/`false`/`1`/`0`） |
| `VISIONKIT_TOOL_CALLING` | `false` | 覆盖模型 tool calling 能力 |
| `VISIONKIT_GROUNDING` | `false` | 覆盖模型 grounding 能力 |
| `VISIONKIT_ENABLE_AGENTIC_ZOOM` | `false` | 为 OCR、UI、图表和技术图启用一次动态局部放大 |
| `VISIONKIT_MAX_ZOOM_ROUNDS` | `1` | Zoom 轮次；当前仅支持 `1` |
| `VISIONKIT_VIDEO_MAX_MB` | `100` | 视频大小上限，最大 `100` |
| `VISIONKIT_VIDEO_MAX_SECONDS` | `120` | 视频时长上限，最大 `120` |
| `VISIONKIT_VIDEO_MAX_FRAMES` | `5` | 最终关键帧预算，范围 `2`～`5`，且不超过模型图片上限 |
| `VISIONKIT_FFMPEG_PATH` | PATH 中的 `ffmpeg` | FFmpeg 可执行文件路径 |
| `VISIONKIT_FFPROBE_PATH` | PATH 中的 `ffprobe` | ffprobe 可执行文件路径 |

未经验证的模型会保守地按单图、`merge_user` 模式工作。请只在确认模型兼容时提高图片上限或开启额外能力。

### 安装 FFmpeg（视频分析需要）

```powershell
winget install --id Gyan.FFmpeg --exact
ffmpeg -version
ffprobe -version
```

若终端仍找不到命令，请重新打开终端，或通过 `VISIONKIT_FFMPEG_PATH` 与 `VISIONKIT_FFPROBE_PATH` 指定完整路径。

## 验证与维护

日常改动后运行：

```powershell
npm run typecheck
npm run test:unit
npm run build
npm run test:smoke
```

以下命令会调用真实模型并消耗 API 额度：

```powershell
npm run test:local .\test.png
npm run test:phase5-mimo .\phase5-video-smoke.mp4
npm run test:phase5-smart
```

详细的验证记录、已知限制和后续计划见 [docs/STATUS.md](./docs/STATUS.md)。

## 许可证与致谢

VisionKit MCP 采用 MIT 许可证，详见 [LICENSE](./LICENSE)。本项目包含并修改了 [luma-mcp](https://github.com/JochenYang/luma-mcp) 的部分代码；Agentic Zoom 与部分专项工具设计参考了 [vision-mcp](https://github.com/Pelican0126/vision-mcp)，当前未声明直接包含其代码。完整归属说明见 [NOTICE](./NOTICE)。
