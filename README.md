# VisionKit MCP

多模型视觉理解 MCP 服务器,为不支持原生视觉能力的 AI 助手提供统一的图片分析能力(后续期次将扩展专项工具集:UI 转代码、OCR、报错诊断、技术图理解、数据可视化、UI 对比)。

> **本项目基于 [luma-mcp](https://github.com/JochenYang/luma-mcp)(JochenYang)与 [vision-mcp](https://github.com/Pelican0126/vision-mcp)(Pelican0126)改造,MIT 协议。** 详见 [NOTICE](./NOTICE)。

## 当前进度(期1)

期1 已完成:仓库初始化、LumaConfig→VisionKitConfig 改名、vitest 测试骨架、安全逻辑(isPrivateIP + 路径校验)抽取与回归测试。

后续期次(专项工具集、Provider 重构、Agentic Zoom、视频)开发中（设计文档待补充）。

## 特性

- 多模型支持：GLM-4.6V、DeepSeek-OCR、Qwen3-VL-Flash、Doubao-Seed-1.6、Hunyuan-Vision-1.5
- 单工具设计：统一通过 `image_understand` 完成图片理解
- 面向复杂截图优化：支持大图多裁剪、文本密集场景保真处理
- 统一预处理链路：本地文件、远程 URL、Data URI 都进入同一套处理流程
- 适用场景完整：代码截图、UI 截图、报错截图、文档截图、OCR
- 标准 MCP 协议：可接入 Claude Desktop、Cline、Claude Code 等客户端
- 内置重试：降低临时网络或模型请求失败带来的影响

## 快速开始

### 前置要求

- Node.js >= 18
- 任意一个模型提供商的 API Key

### 安装

```bash
git clone https://github.com/jinyu/visionkit-mcp.git
cd visionkit-mcp
npm install
npm run build
```

也可以在 MCP 配置中直接使用：

```bash
npx -y visionkit-mcp
```

## 配置

### Claude Desktop 示例

```json
{
  "mcpServers": {
    "visionkit": {
      "command": "npx",
      "args": ["-y", "visionkit-mcp"],
      "env": {
        "MODEL_PROVIDER": "zhipu",
        "ZHIPU_API_KEY": "your-api-key"
      }
    }
  }
}
```

把 `MODEL_PROVIDER` 和对应密钥替换为你实际使用的提供商：

- `zhipu` -> `ZHIPU_API_KEY`
- `siliconflow` -> `SILICONFLOW_API_KEY`
- `qwen` -> `DASHSCOPE_API_KEY`
- `volcengine` -> `VOLCENGINE_API_KEY`
- `hunyuan` -> `HUNYUAN_API_KEY`
- `custom` -> `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` + `CUSTOM_MODEL_NAME`（任意 OpenAI 兼容端点）

可选模型覆盖：

- `MODEL_NAME=doubao-seed-1-6-flash-250828`
- `MODEL_NAME=hunyuan-t1-vision-20250916`
- `MODEL_NAME=HY-vision-1.5-instruct`

#### Custom Provider（v1.5.0+）

使用任意 OpenAI 兼容端点（OpenAI、OpenRouter、Together AI、Anthropic 代理、本地 vLLM/Ollama 等）：

```bash
claude mcp add -s user visionkit-mcp \
  --env MODEL_PROVIDER=custom \
  --env CUSTOM_API_KEY=sk-your-key \
  --env CUSTOM_BASE_URL=https://your-endpoint.com/v1 \
  --env CUSTOM_MODEL_NAME=your-model \
  -- npx -y visionkit-mcp
```

可选配置（都有默认值）：

- `CUSTOM_AUTH_HEADER=bearer` — `bearer` / `x-api-key` / `custom`
- `CUSTOM_PATH=/chat/completions` — API 路径
- `CUSTOM_TIMEOUT_MS=60000` — 超时毫秒
- `CUSTOM_THINKING_MODE=disabled` — `disabled` / `openai` / `qwen_extra_body`
- `CUSTOM_AUTH_HEADER_VALUE="X-API-Key: {{key}}"` — 自定义 Header 模板

开发阶段也可以用交互式配置命令生成项目内配置。请在项目根目录运行：

```bash
npm run configure
```

命令只会询问三项：API endpoint、Model name、API key。Profile 名自动使用模型名，配置保存到项目根目录的 `.visionkit-mcp/config.json`。该文件包含 API key，已由 `.gitignore` 排除，请勿提交到仓库。例如小米 MiMo：

```text
API endpoint: https://api.xiaomimimo.com/v1
Model name: mimo-v2.5
API key: your-api-key
```

VisionKit 会自动识别 `api.xiaomimimo.com` 并使用 `api-key` 鉴权头；其他 OpenAI 兼容端点默认使用 `Authorization: Bearer`。如果只配置了一个 profile，启动 MCP 时无需再传 `CUSTOM_*` 环境变量。

如需把配置保存在其他位置，可通过 `VISIONKIT_CONFIG_FILE` 指定完整路径；该变量的优先级高于项目内默认路径。

开发日志保存在项目根目录的 `.visionkit-mcp/logs/`。配置与日志目录均已由 `.gitignore` 排除，开发阶段不会创建用户主目录下的 `.visionkit-mcp`。

### 快捷配置命令

#### Claude Code

```bash
# Zhipu
claude mcp add -s user visionkit-mcp --env MODEL_PROVIDER=zhipu --env ZHIPU_API_KEY=your-api-key -- npx -y visionkit-mcp

# SiliconFlow
claude mcp add -s user visionkit-mcp --env MODEL_PROVIDER=siliconflow --env SILICONFLOW_API_KEY=your-api-key -- npx -y visionkit-mcp

# Qwen
claude mcp add -s user visionkit-mcp --env MODEL_PROVIDER=qwen --env DASHSCOPE_API_KEY=your-api-key -- npx -y visionkit-mcp

# Volcengine
claude mcp add -s user visionkit-mcp --env MODEL_PROVIDER=volcengine --env VOLCENGINE_API_KEY=your-api-key --env MODEL_NAME=doubao-seed-1-6-flash-250828 -- npx -y visionkit-mcp

# Hunyuan
claude mcp add -s user visionkit-mcp --env MODEL_PROVIDER=hunyuan --env HUNYUAN_API_KEY=your-api-key --env MODEL_NAME=hunyuan-t1-vision-20250916 -- npx -y visionkit-mcp
```

#### 本地开发模式

```json
{
  "mcpServers": {
    "visionkit": {
      "command": "node",
      "args": ["D:\\codes\\visionkit-mcp\\build\\index.js"],
      "env": {
        "MODEL_PROVIDER": "zhipu",
        "ZHIPU_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Cline / VSCode

在项目根目录或 `.vscode/` 下创建 `mcp.json`：

```json
{
  "mcpServers": {
    "visionkit": {
      "command": "npx",
      "args": ["-y", "visionkit-mcp"],
      "env": {
        "MODEL_PROVIDER": "zhipu",
        "ZHIPU_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 使用方式

### `image_understand`

参数：

- `image_source`：本地路径、HTTP(S) 图片 URL、Data URI
- `prompt`：用户对图片的原始问题

示例：

```typescript
image_understand({
  image_source: "./screenshot.png",
  prompt: "分析这个页面的布局和主要组件结构",
});

image_understand({
  image_source: "./code-error.png",
  prompt: "这段代码为什么报错？请给出修复建议",
});

image_understand({
  image_source: "https://example.com/ui.png",
  prompt: "找出这个界面的可用性问题",
});
```

### 使用建议

- 非视觉模型需要明确提示调用 MCP 工具
- 代码截图、OCR、长图、表格这类文本密集图片会自动启用更保真的处理方式
- 大图会按配置自动生成原图加裁剪图，提高细节理解能力

## 环境变量

### 通用配置

| 变量名               | 默认值     | 说明                                                                |
| -------------------- | ---------- | ------------------------------------------------------------------- |
| `MODEL_PROVIDER`     | `zhipu`    | 模型提供商：`zhipu`、`siliconflow`、`qwen`、`volcengine`、`hunyuan` |
| `MODEL_NAME`         | 自动选择   | 模型名称                                                            |
| `BASE_VISION_PROMPT` | 内置默认值 | 自定义基础视觉提示词                                                |
| `MAX_TOKENS`         | `8192`     | 最大生成 token 数（部分模型有硬上限，详见下方说明）                 |
| `VISIONKIT_CONFIG_FILE` | 项目内 `.visionkit-mcp/config.json` | 自定义连接 profile 配置文件的完整路径                    |

> [!IMPORTANT]
> **关于 Token 限制的特别说明：**
>
> 1. **SiliconFlow (DeepSeek-OCR)**: 该模型的总上下文长度（输入+输出）仅为 **8192**。为了确保图片能正常输入，VisionKit 已在客户端内部将 `MAX_TOKENS` 硬性限制在 **4096** 以内。即使你在环境变量中设置了更高的值，也会被截断。
> 2. **通用建议**: 视觉理解任务通常不需要极长的输出。对于大多数模型，建议将 `MAX_TOKENS` 保持在 `4096` 或 `8192`。设置过高（如 `16384`）在处理大图时，可能因总长度超过模型上限而导致 `400` 错误。

### 提供商密钥

| 提供商      | 必填环境变量          | 默认模型                       |
| ----------- | --------------------- | ------------------------------ |
| Zhipu       | `ZHIPU_API_KEY`       | `glm-4.6v`                     |
| SiliconFlow | `SILICONFLOW_API_KEY` | `deepseek-ai/DeepSeek-OCR`     |
| Qwen        | `DASHSCOPE_API_KEY`   | `qwen3-vl-flash`               |
| Volcengine  | `VOLCENGINE_API_KEY`  | `doubao-seed-1-6-flash-250828` |
| Hunyuan     | `HUNYUAN_API_KEY`     | `hunyuan-t1-vision-20250916`   |

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
```

## 图片与处理限制

- 支持格式：JPG、PNG、WebP、GIF
- 最大输入大小：10MB
- 超过 2MB 的图片会自动压缩
- 远程 URL 会先拉取到统一预处理链路，再发送给模型

## 项目结构

```text
visionkit-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── config.ts             # 配置管理
│   ├── vision-client.ts      # 视觉模型客户端接口
│   ├── zhipu-client.ts       # GLM-4.6V 客户端
│   ├── siliconflow-client.ts # DeepSeek-OCR 客户端
│   ├── qwen-client.ts        # Qwen3-VL 客户端
│   ├── volcengine-client.ts  # Doubao-Seed-1.6 客户端
│   ├── hunyuan-client.ts     # Hunyuan-Vision-1.5 客户端
│   ├── image-processor.ts    # 图片预处理与裁剪
│   └── utils/
│       ├── helpers.ts
│       └── logger.ts
├── test/
│   ├── test-local.ts
│   ├── test-qwen.ts
│   ├── test-deepseek-raw.ts
│   └── test-data-uri.ts
├── build/
├── package.json
└── tsconfig.json
```

## 模型选择建议

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
