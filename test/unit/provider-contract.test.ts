import { describe, expect, it, vi } from "vitest";
import type { VisionKitConfig } from "../../src/config.js";
import type { HttpClient, HttpClientFactory, TransportConfig } from "../../src/providers/base-client.js";
import { CustomClient } from "../../src/providers/custom-client.js";

const baseConfig: VisionKitConfig = {
  provider: "custom",
  apiKey: "test-key",
  model: "test-model",
  maxTokens: 8192,
  temperature: 0.7,
  topP: 0.95,
  enableThinking: true,
  multiCrop: true,
  multiCropMaxTiles: 5,
  capabilityOverrides: {},
  customProvider: {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
  },
};

function fakeTransport() {
  const post = vi.fn(async () => ({
    data: { model: "fake", choices: [{ message: { content: "ok" } }] },
  }));
  const transports: TransportConfig[] = [];
  const factory: HttpClientFactory = (transport) => {
    transports.push(transport);
    return { post: post as HttpClient["post"] };
  };
  return { post, factory, transports };
}

describe("Custom provider 契约", () => {
  it("未知模型保守限制为单图，并在请求前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await expect(client.analyze({ images: ["a", "b"], userPrompt: "u" })).rejects.toThrow(
      /超过后端上限 1/
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("空图片请求在调用 transport 前拒绝", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await expect(client.analyze({ images: [], userPrompt: "u" })).rejects.toThrow(/至少需要 1 张图片/);
    expect(post).not.toHaveBeenCalled();
  });

  it("错误统一归一化并脱敏", async () => {
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
    const client = new CustomClient(baseConfig, () => ({ post: post as HttpClient["post"] }));
    await expect(client.analyze({ images: ["image"], userPrompt: "u" })).rejects.toThrow(
      /Custom API error \(401\).*\[REDACTED\]/
    );
  });

  it("空响应按统一错误返回", async () => {
    const post = vi.fn(async () => ({ data: { choices: [{ message: { content: "   " } }] } }));
    const client = new CustomClient(baseConfig, () => ({ post: post as HttpClient["post"] }));
    await expect(client.analyze({ images: ["image"], userPrompt: "u" })).rejects.toThrow(
      /Custom API error: 响应无有效内容/
    );
  });

  it("native system prompt 独立为 system message", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig,
      capabilityOverrides: { maxImages: 2, systemPromptMode: "native" },
    }, factory);
    await client.analyze({
      images: ["image"],
      systemPrompt: "sys",
      userPrompt: "user",
      thinking: false,
    });
    const body = (post.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
    expect((body.messages as unknown[])[0]).toEqual({ role: "system", content: "sys" });
  });

  it("merge_user 将 system prompt 合并到 user 文本", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient(baseConfig, factory);
    await client.analyze({ images: ["image"], systemPrompt: "sys", userPrompt: "user" });
    const body = (post.mock.calls as unknown as [string, any][])[0][1];
    expect(body.messages[0].content.at(-1)).toEqual({ type: "text", text: "sys\n\nuser" });
  });

  it("mimo-v2.5 使用已验收的五图 profile", async () => {
    const { factory, post } = fakeTransport();
    const client = new CustomClient({
      ...baseConfig,
      model: "mimo-v2.5",
      customProvider: {
        apiKey: "mimo-secret",
        baseUrl: "https://example.test/v1",
        model: "mimo-v2.5",
      },
    }, factory);
    const result = await client.analyze({
      images: ["1", "2", "3", "4", "5"],
      userPrompt: "u",
      thinking: true,
    });
    expect(post).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([expect.stringContaining("未配置 thinking")]);
    expect(client.capabilities.maxImages).toBe(5);
  });

  it("统一使用 Bearer 鉴权，并拆分完整 Chat Completions URL", () => {
    const { factory, transports } = fakeTransport();
    new CustomClient({
      ...baseConfig,
      customProvider: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1/chat/completions",
        model: "other-model",
      },
    }, factory);
    expect(transports[0]).toMatchObject({
      baseUrl: "https://example.test/v1",
      requestPath: "/chat/completions",
      timeoutMs: 60_000,
    });
    expect(transports[0].headers.Authorization).toBe("Bearer secret");
    expect(transports[0].headers["Content-Type"]).toBe("application/json");
  });
});
