# VisionKit MCP

多模型视觉理解 MCP 服务器，为不支持原生视觉能力的 AI 助手提供统一的图片分析能力，内置 UI 转代码、OCR、报错诊断、技术图理解、数据可视化和 UI 对比等专项工具。

> **本项目基于 [luma-mcp](https://github.com/JochenYang/luma-mcp)(JochenYang)与 [vision-mcp](https://github.com/Pelican0126/vision-mcp)(Pelican0126)改造,MIT 协议。** 详见 [NOTICE](./NOTICE)。

## 当前进度

期1至期4.1已完成，期5视频分析支持均匀帧、场景关键帧与颜色感知去重；mimo-v2.5 已真实验收图片、Agentic Zoom链路与视频分析。当前状态统一维护在 [docs/STATUS.md](./docs/STATUS.md)。

## 特性

- Custom-only：通过任意 OpenAI 兼容端点接入视觉模型（如已验收的小米 mimo-v2.5）
- 8 个专项工具：通用分析、OCR、报错诊断、技术图、数据图、UI 转换、UI 对比和视频分析
- 面向复杂截图优化：支持大图多裁剪、文本密集场景保真处理
- 统一预处理链路：本地文件、远程 URL、Data URI 都进入同一套处理流程
- 适用场景完整：代码截图、UI 截图、报错截图、文档截图、OCR
- 标准 MCP 协议：可接入 Claude Desktop、Cline、Claude Code 等客户端
- 内置重试：降低临时网络或模型请求失败带来的影响

## 快速开始

### 前置要求

- Node.js >= 22.12（推荐使用当前 LTS）
- 任意一个模型提供商的 API Key

### 安装

```bash
git clone https://github.com/MasterSapphireStar/visionkit-mcp.git
cd visionkit-mcp
npm install
npm run build
```

也可以在 MCP 配置中直接使用：

```bash
npx -y visionkit-mcp
```

## 配置

VisionKit 是 custom-only：通过任意 OpenAI 兼容端点接入视觉模型，统一 `Authorization: Bearer` 鉴权。三个环境变量即可完成配置。

### MCP 客户端配置示例

```json
{
  "mcpServers": {
    "visionkit-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "visionkit-mcp"],
      "env": {
        "VISIONKIT_API_KEY": "YOUR_API_KEY",
        "VISIONKIT_BASE_URL": "https://your-provider.example/v1",
        "VISIONKIT_MODEL": "your-model"
      }
    }
  }
}
```

- `VISIONKIT_API_KEY`：API key（必填）。
- `VISIONKIT_BASE_URL`：OpenAI 兼容端点（必填）。填到版本前缀即可，例如 `https://api.example.com/v1`；也支持填到完整路径 `.../v1/chat/completions`，VisionKit 会自动拆分。
- `VISIONKIT_MODEL`：模型名（必填）。

### Claude Code

```bash
claude mcp add -s user visionkit-mcp \
  --env VISIONKIT_API_KEY=YOUR_API_KEY \
  --env VISIONKIT_BASE_URL=https://your-provider.example/v1 \
  --env VISIONKIT_MODEL=your-model \
  -- npx -y visionkit-mcp
```

### 生成配置片段

如果想在交互式引导下生成配置片段，可在项目根目录运行：

```bash
npm run configure
```

命令会询问 API endpoint、Model name、API key 三项，然后打印一段可直接粘贴到客户端的配置片段。**该命令不会保存任何文件，也不会把真实 API key 打到屏幕**——片段里的 key 是占位符，请在粘贴到客户端后手动填入。

### 迁移说明（从旧版多 provider 升级）

旧版的 `MODEL_PROVIDER=zhipu`（以及 siliconflow / qwen / volcengine / hunyuan）已不再支持。请改为 custom 配置：

```
# 旧
MODEL_PROVIDER=zhipu
ZHIPU_API_KEY=xxxxx

# 新
VISIONKIT_API_KEY=xxxxx
VISIONKIT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISIONKIT_MODEL=glm-4.6v
```

> ⚠️ 以下 endpoint 与模型是从旧版内置代码中提取的迁移参考，均**未做 live probe 验证**，不构成产品推荐或兼容性承诺。迁移后如遇问题，以各家官方文档为准。

| 原 provider   | BASE_URL                                              | 默认 MODEL                     |
| ------------- | ----------------------------------------------------- | ------------------------------ |
| zhipu         | `https://open.bigmodel.cn/api/paas/v4`                | `glm-4.6v`                     |
| siliconflow   | `https://api.siliconflow.cn/v1`                       | `deepseek-ai/DeepSeek-OCR`     |
| qwen          | `https://dashscope.aliyuncs.com/compatible-mode/v1`   | `qwen3-vl-flash`               |
| volcengine    | `https://ark.cn-beijing.volces.com/api/v3`            | `doubao-seed-1-6-flash-250828` |
| hunyuan       | `https://api.hunyuan.cloud.tencent.com/v1`            | `hunyuan-t1-vision-20250916`   |

## 使用方式

### `image_analysis`

参数：

- `image_source`：本地路径、HTTP(S) 图片 URL、Data URI
- `prompt`：用户对图片的原始问题

示例：

```typescript
image_analysis({
  image_source: "./screenshot.png",
  prompt: "分析这个页面的布局和主要组件结构",
});

image_analysis({
  image_source: "./code-error.png",
  prompt: "这段代码为什么报错？请给出修复建议",
});

image_analysis({
  image_source: "https://example.com/ui.png",
  prompt: "找出这个界面的可用性问题",
});
```

### 使用建议

- 非视觉模型需要明确提示调用 MCP 工具
- 代码截图、OCR、长图、表格这类文本密集图片会自动启用更保真的处理方式
- 大图会按配置自动生成原图加裁剪图，提高细节理解能力
- `video_analysis` 需要 FFmpeg/ffprobe，当前仅接受本地 mp4/webm/mov/mkv，且只在模型支持至少2张图片时注册

## 环境变量

### 通用配置

| 变量名               | 默认值     | 说明                                                                |
| -------------------- | ---------- | ------------------------------------------------------------------- |
| `BASE_VISION_PROMPT` | 内置默认值 | 自定义基础视觉提示词                                                |
| `MAX_TOKENS`         | `8192`     | 最大生成 token 数（部分模型有硬上限，详见下方说明）                 |
| `VISIONKIT_API_KEY`  | （无）     | custom provider 的 API key，统一 `Authorization: Bearer`；必填     |
| `VISIONKIT_BASE_URL` | （无）     | OpenAI 兼容端点，填到 `.../v1` 即可，也支持完整路径；必填           |
| `VISIONKIT_MODEL`    | （无）     | 模型名称；必填                                                      |
| `VISIONKIT_MAX_IMAGES` | 按模型能力 profile | 覆盖当前模型最多可接收的图片数（正整数） |
| `VISIONKIT_SYSTEM_PROMPT_MODE` | 按模型能力 profile | `native` 或 `merge_user`，控制 system prompt 的发送方式 |
| `VISIONKIT_NATIVE_VIDEO` | `false` | 覆盖模型是否原生支持视频（`true`/`false`/`1`/`0`） |
| `VISIONKIT_TOOL_CALLING` | `false` | 覆盖模型是否支持 tool calling（`true`/`false`/`1`/`0`） |
| `VISIONKIT_GROUNDING` | `false` | 覆盖模型是否支持 grounding（`true`/`false`/`1`/`0`） |
| `VISIONKIT_ENABLE_AGENTIC_ZOOM` | `false` | 为 OCR、UI 转换、图表和技术图显式启用动态局部放大 |
| `VISIONKIT_MAX_ZOOM_ROUNDS` | `1` | Zoom 轮次；首版仅接受 `1` |
| `VISIONKIT_VIDEO_MAX_MB` | `100` | 视频大小上限，最大只能设为100MB |
| `VISIONKIT_VIDEO_MAX_SECONDS` | `120` | 视频时长上限，最大只能设为120秒 |
| `VISIONKIT_VIDEO_MAX_FRAMES` | `5` | 最终关键帧预算，范围2～5且不超过模型图片上限 |
| `VISIONKIT_FFMPEG_PATH` | PATH 中的 `ffmpeg` | FFmpeg 可执行文件路径 |
| `VISIONKIT_FFPROBE_PATH` | PATH 中的 `ffprobe` | ffprobe 可执行文件路径 |

> 未经验证的 provider/model 默认按单图、`merge_user` 处理；已在本项目完成真实验收的 custom `mimo-v2.5` 默认允许最多 5 图。能力覆盖只描述模型能力，不包含密钥。

> [!IMPORTANT]
> **关于 Token 限制的特别说明：**
>
> 1. **SiliconFlow (DeepSeek-OCR)**: 该模型的总上下文长度（输入+输出）仅为 **8192**。为了确保图片能正常输入，VisionKit 已在客户端内部将 `MAX_TOKENS` 硬性限制在 **4096** 以内。即使你在环境变量中设置了更高的值，也会被截断。
> 2. **通用建议**: 视觉理解任务通常不需要极长的输出。对于大多数模型，建议将 `MAX_TOKENS` 保持在 `4096` 或 `8192`。设置过高（如 `16384`）在处理大图时，可能因总长度超过模型上限而导致 `400` 错误。

## 本地测试

```bash
# 基础测试
npm run test:local ./test.png

# 带问题测试
npm run test:local ./code-error.png "这段代码为什么报错？"

# 远程图片测试
npm run test:local https://example.com/image.jpg

# 检查源码和测试脚本类型
npm run typecheck

# 已配置 mimo-v2.5 和 FFmpeg 时执行视频真实验收
npm run test:phase5-mimo ./phase5-video-smoke.mp4

# 验证均匀采样会漏掉、智能关键帧能捕获的短暂事件
npm run test:phase5-smart

# 离线检查质量 manifest 与评分器（不调用模型）
npm run test:quality
npm run test:quality:score
```

模型质量对照脚本会同时消耗 VisionKit 当前模型和智谱 API 额度，不属于普通测试。执行前设置 `Z_AI_API_KEY`，具体口径与当前基线见 [`docs/QUALITY_BENCHMARK.md`](docs/QUALITY_BENCHMARK.md)。`test:quality` 与 `test:quality:score` 只处理本地 manifest/已有报告，不调用模型。

### 视频分析依赖

`video_analysis` 不在 npm 包中捆绑 FFmpeg。请先安装并确认以下命令可用：

```powershell
winget install --id Gyan.FFmpeg --exact
ffmpeg -version
ffprobe -version
```

安装后若当前终端尚未刷新 PATH，可重新打开终端，或使用 `VISIONKIT_FFMPEG_PATH` 与 `VISIONKIT_FFPROBE_PATH` 指定完整路径。视频会在本机生成均匀候选与场景变化候选，经过相邻画面去重和图片预算选择后，只有最终 JPEG 帧会发送给视觉模型。

## 图片与处理限制

- 支持格式：JPG、PNG、WebP、GIF
- 最大输入大小：10MB
- 超过 2MB 的图片会自动压缩
- 远程 URL 会先拉取到统一预处理链路，再发送给模型
- 视频仅支持本地文件：mp4、webm、mov、mkv；默认最大100MB、120秒、5帧

## 项目结构

```text
visionkit-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── config.ts             # 配置管理
│   ├── providers/            # BaseVisionClient、能力 profile、provider 注册表与薄子类
│   ├── image-processor.ts    # 图片预处理与裁剪
│   ├── media/video-frames.ts # 本地视频校验、ffprobe 与均匀抽帧
│   ├── media/security.ts     # SSRF 与本地路径安全边界
│   └── utils/
│       ├── helpers.ts
│       └── logger.ts
├── test/
│   ├── test-local.ts
│   ├── test-deepseek-raw.ts
│   └── test-data-uri.ts
├── build/
├── package.json
└── tsconfig.json
```

## 模型选择建议

> VisionKit 现在是 custom-only，以下建议仅在把 `VISIONKIT_BASE_URL` 指向对应 provider 端点时作为参考；相关 endpoint 与模型均为从旧版内置代码提取的迁移参考，未做 live probe 验证，不构成产品推荐或兼容性承诺。

- OCR、文字识别：DeepSeek-OCR
- 快速低成本通用分析：Qwen3-VL-Flash
- 高性价比通用分析：Doubao-Seed-1.6
- 深度图片理解：GLM-4.6V
- 复杂图文推理、多语言：Hunyuan-Vision-1.5

## 开发

```bash
npm run watch
npm run build
npm run typecheck
```

## 相关链接

- [智谱开放平台](https://open.bigmodel.cn/)
- [硅基流动平台](https://cloud.siliconflow.cn/)
- [阿里云百炼](https://bailian.console.aliyun.com/)
- [火山方舟](https://console.volcengine.com/ark)
- [腾讯混元](https://cloud.tencent.com/product/hunyuan)
- [MCP 协议](https://modelcontextprotocol.io/)

## 更新历史

（更新历史待补）

## 许可证

MIT
