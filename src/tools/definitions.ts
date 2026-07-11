import { z, type ZodRawShape } from "zod";
import type { PromptKey } from "./prompts.js";

export type MediaKind = "image" | "twoImages" | "video";
export type DetailProfile = "text" | "balanced" | "overview" | "auto";

export interface CapabilityRequirements {
  minImages?: number;
}

export interface ToolDef {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  outputShape: ZodRawShape;
  promptKey: PromptKey;
  media: MediaKind;
  detailProfile: DetailProfile;
  thinkingPolicy?: "on" | "off" | "profile_default";
  requiredCapabilities?: CapabilityRequirements;
  zoomPolicy?: "disabled" | "candidate";
}

const outputShape: ZodRawShape = {
  text: z.string(),
  provider: z.string(),
  model: z.string(),
  detailProfile: z.string(),
  rounds: z.number(),
  warnings: z.array(z.string()),
};

const imageSource = z.string().describe("本地路径 / http(s) URL / Data URI");
const prompt = z.string().min(1).describe("用户的原始问题或要求");

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "image_analysis",
    description: "通用图像分析兜底工具。当其他专项工具(ui_to_artifact/extract_text_from_screenshot/diagnose_error_screenshot/understand_technical_diagram/analyze_data_visualization/ui_diff_check)都不匹配时使用。提供灵活的图像理解。",
    inputShape: { image_source: imageSource, prompt },
    outputShape,
    promptKey: "image_analysis",
    media: "image",
    detailProfile: "auto",
  },
  {
    name: "extract_text_from_screenshot",
    description: "从截图中提取文字(OCR)。专门用于代码、终端输出、文档、表格等文本密集图片。默认直接输出原文,可选 structured 参数加结构化标题。",
    inputShape: {
      image_source: imageSource,
      prompt: z.string().describe("提取要求(可选,默认提取全部文字)"),
      structured: z.boolean().optional().describe("true 时输出 ## 提取文本/## 备注 标题;默认 false 纯原文"),
    },
    outputShape,
    promptKey: "extract_text",
    media: "image",
    detailProfile: "text",
    zoomPolicy: "candidate",
  },
  {
    name: "diagnose_error_screenshot",
    description: "诊断报错截图(错误弹窗、堆栈、日志)。输出根因、错误原文、位置、修复步骤。",
    inputShape: {
      image_source: imageSource,
      prompt: z.string().describe("关于错误的描述或上下文"),
      context: z.string().optional().describe("错误发生背景,如 'during npm install'"),
    },
    outputShape,
    promptKey: "diagnose_error",
    media: "image",
    detailProfile: "text",
  },
  {
    name: "understand_technical_diagram",
    description: "解读技术图表:架构图、流程图、UML、ER 图、时序图等。输出类型、节点、关系与流程、要点。",
    inputShape: {
      image_source: imageSource,
      prompt: z.string().describe("想从图表理解什么"),
      diagram_type: z.string().optional().describe("图表类型提示,如 architecture/flowchart/uml/er-diagram/sequence"),
    },
    outputShape,
    promptKey: "understand_technical_diagram",
    media: "image",
    detailProfile: "balanced",
    zoomPolicy: "candidate",
  },
  {
    name: "analyze_data_visualization",
    description: "分析数据可视化(图表、仪表盘)。输出图表类型、数据(表格化)、洞察(趋势/异常)。",
    inputShape: {
      image_source: imageSource,
      prompt: z.string().describe("想从可视化提取哪些信息"),
      analysis_focus: z.string().optional().describe("分析焦点,如 trends/anomalies/comparisons"),
    },
    outputShape,
    promptKey: "analyze_data_visualization",
    media: "image",
    detailProfile: "balanced",
    zoomPolicy: "candidate",
  },
  {
    name: "ui_to_artifact",
    description: "将 UI 截图转换为产物。output_type=code 生成前端代码,output_type=spec 提取设计规范。",
    inputShape: {
      image_source: imageSource,
      prompt: z.string().describe("要根据 UI 图生成什么"),
      output_type: z.enum(["code", "spec"]).describe("code=前端代码,spec=设计规范"),
    },
    outputShape,
    promptKey: "ui_to_artifact_code", // handler 按 output_type 切换
    media: "image",
    detailProfile: "balanced",
    zoomPolicy: "candidate",
  },
  {
    name: "ui_diff_check",
    description: "对比两张 UI 截图(期望 vs 实际实现),识别视觉差异与实现偏差。用于 UI 质量保证、设计到实现验证。",
    inputShape: {
      expected_image_source: z.string().describe("预期/参考设计图"),
      actual_image_source: z.string().describe("实际实现图"),
      prompt: z.string().describe("对比关注的方面"),
    },
    outputShape,
    promptKey: "ui_diff_check",
    media: "twoImages",
    detailProfile: "balanced",
    requiredCapabilities: { minImages: 2 },
  },
  {
    name: "video_analysis",
    description: "分析本地短视频。通过 FFmpeg 均匀抽取时间帧，输出视频概述、时间线、关键细节与不确定性。",
    inputShape: {
      video_source: z.string().describe("本地 mp4/webm/mov/mkv 文件路径"),
      prompt: z.string().min(1).describe("希望从视频中分析什么"),
    },
    outputShape,
    promptKey: "video_analysis",
    media: "video",
    detailProfile: "balanced",
    requiredCapabilities: { minImages: 2 },
  },
];
