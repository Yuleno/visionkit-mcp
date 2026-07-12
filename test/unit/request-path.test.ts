import { describe, expect, it } from "vitest";
import { normalizeEndpoint } from "../../src/providers/request-path.js";

describe("normalizeEndpoint", () => {
  it("base URL 不含 /chat/completions 时补上 requestPath", () => {
    expect(normalizeEndpoint("https://api.example.com/v1")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("base URL 已含 /chat/completions 时拆分，避免拼接重复", () => {
    expect(normalizeEndpoint("https://api.example.com/v1/chat/completions")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("忽略 /chat/completions 的尾斜杠", () => {
    expect(normalizeEndpoint("https://api.example.com/v1/chat/completions/")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("去掉 baseURL 尾部多余斜杠", () => {
    expect(normalizeEndpoint("https://api.example.com/v1///")).toEqual({
      baseURL: "https://api.example.com/v1",
      requestPath: "/chat/completions",
    });
  });

  it("无版本前缀的 base URL 也能补 requestPath", () => {
    expect(normalizeEndpoint("https://api.example.com")).toEqual({
      baseURL: "https://api.example.com",
      requestPath: "/chat/completions",
    });
  });
});
