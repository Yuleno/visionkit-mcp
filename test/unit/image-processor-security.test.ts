import { describe, expect, it, vi } from "vitest";
import { fetchRemoteImage, type RemoteImageDependencies } from "../../src/image-processor.js";

function fakeDependencies(address: string) {
  let capturedConfig: Record<string, any> | undefined;
  const get = vi.fn(async (_url: string, config: Record<string, any>) => {
    capturedConfig = config;
    return {
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      headers: { "content-type": "image/png" },
    };
  });
  const dependencies: RemoteImageDependencies = {
    lookup: vi.fn(async () => ({ address })),
    get,
    createHttpsAgent: vi.fn((options) => ({ options }) as any),
  };
  return { dependencies, get, getCapturedConfig: () => capturedConfig };
}

describe("fetchRemoteImage security contract", () => {
  it("域名解析到私网地址时在 HTTP 请求前拒绝", async () => {
    const { dependencies, get } = fakeDependencies("10.0.0.8");

    await expect(
      fetchRemoteImage("https://example.test/image.png", 10, dependencies)
    ).rejects.toThrow(/internal\/private address/);
    expect(get).not.toHaveBeenCalled();
  });

  it("URL 直接使用私网 IP 时不执行 DNS 或 HTTP", async () => {
    const { dependencies, get } = fakeDependencies("8.8.8.8");

    await expect(
      fetchRemoteImage("http://127.0.0.1/image.png", 10, dependencies)
    ).rejects.toThrow(/internal\/private address/);
    expect(dependencies.lookup).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("公网请求禁用重定向并将连接固定到已校验 IP", async () => {
    const { dependencies, getCapturedConfig } = fakeDependencies("8.8.8.8");

    await expect(
      fetchRemoteImage("https://images.example.test/image.png", 10, dependencies)
    ).resolves.toMatchObject({ mimeType: "image/png" });

    const config = getCapturedConfig();
    expect(config).toMatchObject({
      responseType: "arraybuffer",
      maxRedirects: 0,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    });
    expect(dependencies.createHttpsAgent).toHaveBeenCalledWith({
      servername: "images.example.test",
    });

    const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      config?.lookup("ignored.example", {}, (error: Error | null, value: { address: string; family: number }) => {
        if (error) reject(error);
        else resolve(value);
      });
    });
    expect(resolved).toEqual({ address: "8.8.8.8", family: 4 });
  });
});
