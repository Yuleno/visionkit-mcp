# VisionKit MCP 期6专项设计：质量基准与证据约束

> 状态：首版完成
> 日期：2026-07-12
> 关联：`docs/QUALITY_BENCHMARK.md`、期4 Agentic Zoom、期5 视频分析

## 目标与边界

期6不新增 MCP 工具、Provider 自动路由、远程视频、音频或 grounding。目标是让现有八个工具的质量变化可测量、可复现，并降低 UI diff、OCR、技术图和报错诊断中的无依据陈述。

本期交付分两层：

1. **离线层**：机器可读 manifest、纯函数评分器、结果报告 CLI 与单元测试；不调用模型，进入 CI。
2. **在线层**：复用现有 mimo/智谱比较脚本输出，只有在用户明确授权后执行；离线评分器读取已保存的报告，比较模型、prompt 或策略版本。

评分器不试图判定所有自然语言是否真实，而只对 manifest 声明的关键事实、禁止的无依据表述和输出格式做确定性判定；开放式质量仍保留人工复核。

## Manifest

新增 `test/quality/quality-manifest.json`。每个 case 包含：

```ts
interface QualityCase {
  id: string;
  tool: string;
  source: string | string[];       // 仅复现定位；样本本身可保持本地忽略
  requiredFacts: Array<{ id: string; anyOf: string[]; weight?: number }>;
  forbiddenClaims?: Array<{ id: string; patterns: string[] }>;
  format?: { requiredHeadings?: string[]; rawTextOnly?: boolean };
}
```

- requiredFacts 使用 `anyOf` 支持同义表达，按权重计算召回率。
- forbiddenClaims 只记录源文件能够明确否定的内容，例如错误像素值或未画出的“同步流程”；命中即计无依据陈述。
- `rawTextOnly` 用于 OCR 默认模式，拒绝标题和解释性前后缀。
- manifest 只含事实和相对样本路径，不含 API key、模型回答或图片二进制。

## 评分与报告

`src/quality/scorer.ts` 输出：

```ts
interface QualityScore {
  caseId: string;
  factRecall: number;              // 加权关键事实召回率，0~1
  matchedFacts: string[];
  missingFacts: string[];
  unsupportedClaims: string[];
  formatCompliant: boolean;
  elapsedMs?: number;
  rounds?: number;
}
```

文本采用 Unicode 兼容规范化、大小写归一和空白归一。评分器不把“未命中”直接当作模型错误：缺失事实、无依据陈述、格式不符分开报告。`test/manual/score-quality.ts` 可读取 `.visionkit-mcp/` 的对比报告，输出 VisionKit 与官方 MCP 的逐 case 评分及汇总。

## 证据约束

只修改专项 prompt，不改变 MCP 输入参数：

- OCR 默认模式只输出可见原文；不确定字符用 `看不清`，不附加质量判断。
- 技术图将“节点、边、方向、标签”限定为图中直接可见内容；任何实现/时序推断须在 `## 要点` 中以“推断：”显式标记。
- UI diff 每一项必须写明可见位置、期望和实际；禁止无图像测量依据的精确像素、百分比或 CSS 值；无法确认时写“无法从截图精确测量”。
- 报错诊断把截图中逐字可见的错误/路径/行列放在“错误原文/位置”，根因与修复明确区分为分析建议。
- 视频继续以采样帧和时间点为边界，不从单帧推断未观察到的连续动作。

本期不引入完整 UI 组件检测、通用箭头/图表数字化或额外 OCR runtime。后续只有基准证明这些能力有稳定收益时才立项。

## 验收

- manifest 覆盖 OCR、技术图、报错、UI diff 四组既有样本；评分器单测覆盖同义命中、权重、禁止表述、raw OCR 与 heading 格式。
- `npm run test:quality` 离线通过，无 API 消耗。
- prompt 单测锁定证据约束语句，避免后续回归。
- 经用户授权后运行真实 VisionKit/智谱对比并执行 `test:quality:score`；报告只说明样本范围内的结果。
