import { describe, expect, it, vi } from "vitest";
import type { VisionKitConfig } from "../../src/config.js";
import { CustomClient } from "../../src/providers/custom-client.js";
import { HunyuanClient } from "../../src/providers/hunyuan-client.js";
import { QwenClient } from "../../src/providers/qwen-client.js";
import { SiliconFlowClient } from "../../src/providers/siliconflow-client.js";
import { VolcengineClient } from "../../src/providers/volcengine-client.js";
import { ZhipuClient } from "../../src/providers/zhipu-client.js";
import type { HttpClientFactory, TransportConfig } from "../../src/providers/base-client.js";

const baseConfig: VisionKitConfig = {
  provider: "zhipu", apiKey: "test-key", model: "test-model", maxTokens: 8192,
  temperature: 0.7, topP: 0.95, enableThinking: true, multiCrop: true,
  multiCropMaxTiles: 5, capabilityOverrides: {},
};

function fakeTransport() {
  const post = vi.fn(async () => ({ data: { model: "fake", choices: [{ message: { content: "ok" } }] } }));
  const transports: TransportConfig[] = [];
  const factory: HttpClientFactory = (transport) => {
    transports.push(transport);
    return { post: post as any };
  };
  return { post, factory, transports };
}

describe("Provider 契约", () => {
  it("未知模型保守限制为单图，并在请求前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new ZhipuClient(baseConfig, factory);
    await expect(client.analyze({ images: ["a", "b"], userPrompt: "u" })).rejects.toThrow(/超过后端上限 1/);
    expect(post).not.toHaveBeenCalled();
  });

  it("空图片请求在调用 transport 前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new ZhipuClient(baseConfig, factory);
    await expect(client.analyze({ images: [], userPrompt: "u" })).rejects.toThrow(/至少需要 1 张图片/);
    expect(post).not.toHaveBeenCalled();
  });

  it("Provider 错误统一归一化并脱敏", async () => {
    const post = vi.fn(async () => {
      throw {
        isAxiosError: true,
        message: "request failed",
        response: {
          status: 401,
          data: {
            error: {
              message: 'api-key=secret-key Authorization: Bearer bearer-secret token="token-secret" data:image/png;base64,QUJDRA==',
            },
          },
        },
      };
    });
    const client = new ZhipuClient(baseConfig, () => ({ post: post as any }));

    let caught: unknown;
    try {
      await client.analyze({ images: ["image"], userPrompt: "u" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("GLM API error (401)");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("secret-key");
    expect(message).not.toContain("bearer-secret");
    expect(message).not.toContain("token-secret");
    expect(message).not.toContain("QUJDRA");
  });

  it("空响应按统一 Provider 错误返回", async () => {
    const post = vi.fn(async () => ({ data: { choices: [{ message: { content: "   " } }] } }));
    const client = new ZhipuClient(baseConfig, () => ({ post: post as any }));

    await expect(client.analyze({ images: ["image"], userPrompt: "u" })).rejects.toThrow(
      /GLM API error: 响应无有效内容/
    );
  });

  it("native system prompt 独立为 system message", async () => {
    const { factory, post } = fakeTransport();
    const client = new ZhipuClient({ ...baseConfig, capabilityOverrides: { maxImages: 2, systemPromptMode: "native" } }, factory);
    await client.analyze({ images: ["image"], systemPrompt: "sys", userPrompt: "user", thinking: false });
    const body = (post.mock.calls as unknown as [string, any][])[0][1];
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("merge_user 将 system prompt 合并到 user 文本", async () => {
    const { factory, post } = fakeTransport();
    const client = new ZhipuClient(baseConfig, factory);
    await client.analyze({ images: ["image"], systemPrompt: "sys", userPrompt: "user" });
    const body = (post.mock.calls as unknown as [string, any][])[0][1];
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content.at(-1)).toEqual({ type: "text", text: "sys\n\nuser" });
  });

  it.each([
    ["true", true, { type: "enabled" }],
    ["false", false, { type: "disabled" }],
    ["undefined", undefined, undefined],
  ] as const)("Zhipu thinking=%s payload 正确", async (_label, thinking, expected) => {
    const { factory, post } = fakeTransport();
    const client = new ZhipuClient(baseConfig, factory);
    await client.analyze({ images: ["image"], userPrompt: "user", thinking });
    expect(((post.mock.calls as unknown as [string, any][])[0][1] as any).thinking).toEqual(expected);
  });

  it("Qwen 锁定 thinking true/false/undefined 三态 payload", async () => {
    for (const [thinking, expected] of [[true, { enable_thinking: true, thinking_budget: 81920 }], [false, { enable_thinking: false }], [undefined, undefined]] as const) {
      const { factory, post } = fakeTransport();
      const client = new QwenClient({ ...baseConfig, provider: "qwen", capabilityOverrides: { maxImages: 1 } }, factory);
      await client.analyze({ images: ["image"], userPrompt: "user", thinking });
      expect(((post.mock.calls as unknown as [string, any][])[0][1] as any).extra_body).toEqual(expected);
    }
  });

  it("SiliconFlow 仅对 thinking=true 产生 warning", async () => {
    const { factory } = fakeTransport();
    const client = new SiliconFlowClient({ ...baseConfig, provider: "siliconflow", model: "deepseek-ai/DeepSeek-OCR" }, factory);
    await expect(client.analyze({ images: ["image"], userPrompt: "u", thinking: true })).resolves.toMatchObject({ warnings: [expect.stringContaining("不支持 thinking")] });
  });

  it.each([
    [false, undefined],
    [undefined, undefined],
  ] as const)("SiliconFlow thinking=%s 不产生 warning", async (thinking, expected) => {
    const { factory } = fakeTransport();
    const client = new SiliconFlowClient({ ...baseConfig, provider: "siliconflow", model: "deepseek-ai/DeepSeek-OCR" }, factory);
    await expect(client.analyze({ images: ["image"], userPrompt: "u", thinking })).resolves.toEqual({ text: "ok", warnings: expected });
  });

  it("SiliconFlow 将 max_tokens 截断到 4096", async () => {
    const { factory, post } = fakeTransport();
    const client = new SiliconFlowClient({ ...baseConfig, provider: "siliconflow", model: "deepseek-ai/DeepSeek-OCR", maxTokens: 8192 }, factory);
    await client.analyze({ images: ["image"], userPrompt: "u" });
    expect(((post.mock.calls as unknown as [string, any][])[0][1] as any).max_tokens).toBe(4096);
  });

  it.each([
    ["true", true, { type: "enabled" }],
    ["false", false, { type: "disabled" }],
    ["undefined", undefined, undefined],
  ] as const)("Volcengine thinking=%s payload 正确", async (_label, thinking, expected) => {
    const { factory, post } = fakeTransport();
    const client = new VolcengineClient({ ...baseConfig, provider: "volcengine" }, factory);
    await client.analyze({ images: ["image"], userPrompt: "u", thinking });
    expect(((post.mock.calls as unknown as [string, any][])[0][1] as any).thinking).toEqual(expected);
  });

  it.each([
    ["true", true, true],
    ["false", false, false],
    ["undefined", undefined, undefined],
  ] as const)("Hunyuan thinking=%s payload 正确", async (_label, thinking, expected) => {
    const { factory, post } = fakeTransport();
    const client = new HunyuanClient({ ...baseConfig, provider: "hunyuan" }, factory);
    await client.analyze({ images: ["image"], userPrompt: "u", thinking });
    expect(((post.mock.calls as unknown as [string, any][])[0][1] as any).enable_thinking).toBe(expected);
  });

  it("mimo-v2.5 使用已验收的五图 profile，custom thinking disabled 给出 warning", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig, provider: "custom", model: "mimo-v2.5",
      customProvider: { apiKey: "mimo-secret", baseUrl: "https://example.test/v1", model: "mimo-v2.5", authHeader: "custom", authHeaderValue: "api-key: {{key}}", path: "/chat/completions", timeoutMs: 1000, thinkingMode: "disabled" },
    }, factory);
    const result = await client.analyze({ images: ["1", "2", "3", "4", "5"], userPrompt: "u", thinking: true });
    expect(post).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([expect.stringContaining("未配置 thinking")]);
    expect(client.capabilities.maxImages).toBe(5);
  });

  it.each([
    ["openai", true, true, undefined],
    ["openai", false, false, undefined],
    ["openai", undefined, undefined, undefined],
    ["qwen_extra_body", true, undefined, { enable_thinking: true }],
    ["qwen_extra_body", false, undefined, { enable_thinking: false }],
    ["qwen_extra_body", undefined, undefined, undefined],
  ] as const)("Custom %s thinking=%s payload 正确", async (mode, thinking, enableThinking, extraBody) => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig,
      provider: "custom",
      customProvider: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1",
        model: "other-model",
        authHeader: "bearer",
        path: "/responses",
        timeoutMs: 1234,
        thinkingMode: mode,
      },
    }, factory);
    await client.analyze({ images: ["image"], userPrompt: "u", thinking });
    const body = (post.mock.calls as unknown as [string, any][])[0][1];
    expect(body.enable_thinking).toBe(enableThinking);
    expect(body.extra_body).toEqual(extraBody);
  });

  it.each([
    ["bearer", undefined, "Authorization", "Bearer secret"],
    ["x-api-key", undefined, "x-api-key", "secret"],
    ["custom", "X-Custom-Key: {{key}}", "X-Custom-Key", "secret"],
  ] as const)("Custom %s 鉴权生成正确 Header", (authHeader, authHeaderValue, headerName, expected) => {
    const { factory, transports } = fakeTransport();
    new CustomClient({
      ...baseConfig,
      provider: "custom",
      customProvider: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1/",
        model: "other-model",
        authHeader,
        authHeaderValue,
        path: "/responses",
        timeoutMs: 1234,
        thinkingMode: "disabled",
      },
    }, factory);
    expect(transports[0]).toMatchObject({ baseUrl: "https://example.test/v1/", requestPath: "/responses", timeoutMs: 1234 });
    expect(transports[0].headers[headerName]).toBe(expected);
  });

  it("六家 Provider transport 的 endpoint、path 与 Bearer header 正确", () => {
    const cases = [
      [ZhipuClient, "zhipu", "https://open.bigmodel.cn/api/paas/v4"],
      [SiliconFlowClient, "siliconflow", "https://api.siliconflow.cn/v1"],
      [QwenClient, "qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1"],
      [VolcengineClient, "volcengine", "https://ark.cn-beijing.volces.com/api/v3"],
      [HunyuanClient, "hunyuan", "https://api.hunyuan.cloud.tencent.com/v1"],
    ] as const;
    for (const [Client, provider, baseUrl] of cases) {
      const { factory, transports } = fakeTransport();
      new Client({ ...baseConfig, provider }, factory);
      expect(transports[0]).toMatchObject({ baseUrl, requestPath: "/chat/completions" });
      expect(transports[0].headers.Authorization).toBe("Bearer test-key");
    }
  });
});
