# 视觉质量基准

本文记录 VisionKit MCP 的质量评估方法和可复现对照结果。项目完成状态和下一步仍以 `STATUS.md` 为唯一事实源。

## 当前结论

2026-07-12 使用 `imageTest/` 中 4 组样本，对 VisionKit（mimo-v2.5）与智谱官方 Vision MCP（GLM-4.6V，`@z_ai/mcp-server@0.1.2`）进行了同图、同提示词的探索性对照。

| 样本 | 质量观察 | VisionKit 耗时 | 智谱官方耗时 |
| --- | --- | ---: | ---: |
| OCR | 关键信息基本打平；VisionKit 更直接遵循 OCR 输出诉求 | 13.3 秒 | 35.3 秒 |
| 技术图 | 均识别 5 个节点和 5 条连接；官方结果包含少量图中未明示的推断 | 8.3 秒 | 47.8 秒 |
| 报错诊断 | 根因与修复方向均正确；VisionKit 更精简 | 9.6 秒 | 32.3 秒 |
| UI 差异 | 双方均有漏检或误判，尚无稳定胜者 | 8.6 秒 | 85.4 秒 |

本轮单工具平均耗时约为 VisionKit 10.0 秒、智谱官方 50.2 秒。该结果只代表当前样本、模型和网络环境，不能用于宣称某个模型全面优于另一个模型。

原始报告写入已被 Git 忽略的 `.visionkit-mcp/`：`zai-vision-comparison.json` 和 `zai-vision-comparison-ui_diff.json`。

## 期7 custom-only 重构后复测

2026-07-13 在 custom-only 配置收敛（统一 `Authorization: Bearer`、`VISIONKIT_*` 三件套）落地后，用同一组 4 个样本重跑对照，确认重构链路质量无回退。VisionKit 侧通过 `VISIONKIT_BASE_URL=https://api.xiaomimimo.com/v1` + `VISIONKIT_MODEL=mimo-v2.5` 接入，验证统一 Bearer 下小米 MiMo 端点可正常调用（旧版基于 hostname 的 `api-key:` 特判已移除）。

| 样本 | 质量观察 | VisionKit 耗时 | 智谱官方耗时 |
| --- | --- | ---: | ---: |
| OCR | 双方均完整提取密集表格与散点标签；VisionKit 更贴 prompt、不超额发挥 | 10.5 秒 | 38.4 秒 |
| 技术图 | 均识别 5 节点 5 连线；官方额外给出架构评价与 Mermaid 图，含图外推断 | 11.7 秒 | 30.0 秒 |
| 报错诊断 | 根因均正确；VisionKit 给出精确 `:18:24` 位置，官方修复建议更展开但漏列号 | 9.6 秒 | 25.7 秒 |
| UI 差异 | VisionKit 列出 8 条差异并诚实标注像素值不可测；官方仅判“约 90% 相似”，严重漏检 | 19.7 秒 | 43.5 秒 |

本轮单工具平均耗时约为 VisionKit 12.9 秒、智谱官方 34.4 秒。离线评分（基于 `test/quality/quality-manifest.json`）为：

| 实现 | 平均关键事实召回 | 格式遵从 | 无依据命中 |
| --- | ---: | ---: | ---: |
| VisionKit + mimo-v2.5 | 100% | 4 / 4 | 0 |
| 智谱官方 MCP + GLM-4.6V | 62.5% | 1 / 4 | 3 |

与 2026-07-12 基线趋势一致：VisionKit 更快（约 2.7 倍）、事实召回更高、推断更诚实。该结论仍只代表这 4 组开发者任务样本，不能外推为 mimo-v2.5 模型全面优于 GLM-4.6V；智谱官方的超额详尽在需要长篇解释的场景下也可能是优点。原始报告写入已被 Git 忽略的 `.visionkit-mcp/zai-vision-comparison.json`。

## 期6离线评分与证据约束

已提交的 `test/quality/quality-manifest.json` 将上述四组样本的直接事实、格式要求和已知无依据表述写为机器可读规则。`src/quality/scorer.ts` 以关键事实召回、无依据命中、格式遵从、耗时和轮次评分；它不调用模型，也不把开放式自然语言评价伪装为客观分数。

2026-07-12 在强化 OCR、技术图、报错和 UI diff 的事实/推断约束后重跑对照。当前 manifest 的离线评分为：

| 实现 | 平均关键事实召回 | 格式遵从 | 无依据命中 |
| --- | ---: | ---: | ---: |
| VisionKit + mimo-v2.5 | 100% | 4 / 4 | 0 |
| 智谱官方 MCP + GLM-4.6V | 68.75% | 0 / 4 | 2 |

该表仅代表这4个 manifest case，不能用于宣称任一模型全面更优。特别是 UI diff 的“无依据”只检测 manifest 显式声明的 CSS 数值/像素等模式，仍需人工复核其他开放式表述。

## 基准事实

后续自动评分应以源文件中的直接证据为准，不以任一模型的回答作为标准答案。

### 技术架构图

`validation-architecture.svg` 包含 5 个节点：MCP Client、VisionKit Server、Image Processor、Vision Provider、Structured Result；包含 5 条有向连接，标签依次为 `callTool`、`image source`、`prepared images`、`model response`、`MCP response`。

### 报错截图

`validation-error.svg` 的核心事实包括：

- 错误为 `TypeError: Cannot read properties of undefined (reading 'map')`。
- 首个业务栈位置是 `src/components/UserList.tsx:18:24` 的 `renderUsers`。
- 第 18 行调用 `users.map(...)`。
- 失败时 props 中 `users` 为 `undefined`，`loading` 为 `false`。

### UI 差异

`validation-ui-expected.svg` 与 `validation-ui-actual.svg` 的直接差异包括：

- 实际图缺少副标题。
- Header、Logo、卡片和下方面板的位置与尺寸不同。
- 卡片及面板圆角由较大圆角变为较小圆角。
- 进度条由浅蓝/蓝色变为浅绿/绿色，填充比例也不同。
- 按钮的位置、尺寸、圆角和颜色均不同。

模型输出若给出源图无法支持的精确像素值、因果关系或流程语义，应计为无依据陈述。

## 评分维度

每个样本至少记录：

1. 关键事实召回率。
2. 无依据陈述数。
3. 格式遵从率。
4. 任务专项指标：OCR 字符准确率、节点/边准确率、错误位置准确率、UI 差异召回与误报。
5. 性能：预处理耗时、模型耗时、总耗时、图片数和调用轮次。

自动评分应优先采用结构化事实匹配；开放式描述作为人工复核项，避免让另一个模型直接充当唯一裁判。

## 复现方式

```powershell
$env:Z_AI_API_KEY = "<your-key>"
npm run test:compare-zai
npm run test:compare-zai:ui-diff
npm run test:quality
npm run test:quality:score
```

脚本同时消耗 mimo-v2.5 和智谱 API 额度，不能作为普通单元测试自动运行。为保证结果可比较，智谱 MCP npm 包固定为 `0.1.2`；升级时应记录版本并重新建立基线。

`.mcp.json` 可作为被忽略的本地配置，但不得提交真实 Key。环境变量优先于该文件中的同名配置。

## 下一步

- 扩充小字 UI、密集表格、图表、复杂错误和不同视频事件样本。
- 为 UI diff、OCR 和技术图输出增加“直接证据/推断”区分。
- 使用基准结果决定 Agentic Zoom 的触发阈值，未稳定提高召回前继续默认关闭。
