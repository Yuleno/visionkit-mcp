import { describe, expect, it } from "vitest";
import { resolveEndpoint } from "../../src/providers/request-path.js";

/**
 * resolveEndpoint 覆盖全部国内主流厂商 + 自建端点，验证「一条铁律 + 零厂商特判」。
 * 数据来自对各家官方文档的实测调研（小米/Kimi/DeepSeek/智谱/百炼/火山/千帆/阶跃）。
 */
describe("resolveEndpoint — OpenAI 协议（补 /chat/completions，不补版本前缀）", () => {
  it.each([
    // [label, 用户填的 base_url, 期望 baseURL, 期望 requestPath]
    ["纯 host（DeepSeek 风格）", "https://api.deepseek.com", "https://api.deepseek.com", "/chat/completions"],
    ["末尾 /v1（小米/Kimi/本地通用）", "https://api.xiaomimimo.com/v1", "https://api.xiaomimimo.com/v1", "/chat/completions"],
    ["末尾 /v1（Kimi 国内）", "https://api.moonshot.cn/v1", "https://api.moonshot.cn/v1", "/chat/completions"],
    ["百炼 compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1", "/chat/completions"],
    ["智谱开放平台 /api/paas/v4", "https://open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4", "/chat/completions"],
    ["智谱 Coding /api/coding/paas/v4", "https://open.bigmodel.cn/api/coding/paas/v4", "https://open.bigmodel.cn/api/coding/paas/v4", "/chat/completions"],
    ["火山方舟 /api/v3", "https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-beijing.volces.com/api/v3", "/chat/completions"],
    ["百度千帆 /v2", "https://qianfan.baidubce.com/v2", "https://qianfan.baidubce.com/v2", "/chat/completions"],
    ["自建端点纯 host", "http://evo4.local:20128", "http://evo4.local:20128", "/chat/completions"],
    ["自建端点带 /v1", "http://evo4.local:20128/v1", "http://evo4.local:20128/v1", "/chat/completions"],
  ])("%s", (_label, input, expectedBase, expectedPath) => {
    expect(resolveEndpoint(input, "openai")).toEqual({ baseURL: expectedBase, requestPath: expectedPath });
  });

  it("用户已粘完整 /v1/chat/completions → 拆出 baseURL，不重复拼接", () => {
    expect(resolveEndpoint("https://api.example.com/v1/chat/completions", "openai")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("去掉 baseURL 尾部多余斜杠", () => {
    expect(resolveEndpoint("https://api.example.com/v1///", "openai")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("/chat/completions 尾斜杠也能拆分", () => {
    expect(resolveEndpoint("https://api.example.com/v1/chat/completions/", "openai")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });
});

describe("resolveEndpoint — Anthropic 协议（补 /v1/messages，不补版本前缀）", () => {
  it.each([
    ["小米 MiMo /anthropic", "https://api.xiaomimimo.com/anthropic", "https://api.xiaomimimo.com/anthropic", "/v1/messages"],
    ["Kimi /anthropic", "https://api.moonshot.ai/anthropic", "https://api.moonshot.ai/anthropic", "/v1/messages"],
    ["DeepSeek /anthropic", "https://api.deepseek.com/anthropic", "https://api.deepseek.com/anthropic", "/v1/messages"],
    ["智谱 /api/anthropic", "https://open.bigmodel.cn/api/anthropic", "https://open.bigmodel.cn/api/anthropic", "/v1/messages"],
    ["百炼 /apps/anthropic", "https://dashscope.aliyuncs.com/apps/anthropic", "https://dashscope.aliyuncs.com/apps/anthropic", "/v1/messages"],
    ["火山 /api/compatible", "https://ark.cn-beijing.volces.com/api/compatible", "https://ark.cn-beijing.volces.com/api/compatible", "/v1/messages"],
    ["阶跃 /step_plan", "https://api.stepfun.com/step_plan", "https://api.stepfun.com/step_plan", "/v1/messages"],
    ["官方 api.anthropic.com 纯 host", "https://api.anthropic.com", "https://api.anthropic.com", "/v1/messages"],
    ["自建端点纯 host", "http://evo4.local:20128", "http://evo4.local:20128", "/v1/messages"],
  ])("%s", (_label, input, expectedBase, expectedPath) => {
    expect(resolveEndpoint(input, "anthropic")).toEqual({ baseURL: expectedBase, requestPath: expectedPath });
  });

  it("用户已粘完整 /v1/messages → 拆出 baseURL，不重复拼接", () => {
    expect(resolveEndpoint("https://api.xiaomimimo.com/anthropic/v1/messages", "anthropic")).toEqual({
      baseURL: "https://api.xiaomimimo.com/anthropic",
      requestPath: "/v1/messages",
    });
  });

  it("末尾精确 /v1 → 剥掉补 /v1/messages，防 /v1/v1/messages 双重路径", () => {
    expect(resolveEndpoint("https://example.com/anthropic/v1", "anthropic")).toEqual({
      baseURL: "https://example.com/anthropic",
      requestPath: "/v1/messages",
    });
  });

  it("不误伤 /v11（字面路径段）", () => {
    expect(resolveEndpoint("https://api.example.com/v11", "anthropic")).toEqual({
      baseURL: "https://api.example.com/v11",
      requestPath: "/v1/messages",
    });
  });

  it("去掉 baseURL 尾部多余斜杠", () => {
    expect(resolveEndpoint("https://api.example.com/apps/anthropic///", "anthropic")).toEqual({
      baseURL: "https://api.example.com/apps/anthropic",
      requestPath: "/v1/messages",
    });
  });
});
