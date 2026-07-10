import { describe, it, expect } from "vitest";
import { isPrivateIP, assertPathInAllowedDirs } from "../../src/media/security-utils.js";

describe("isPrivateIP", () => {
  // IPv4 私有段（锁住 luma 现有行为）
  it("识别 10.0.0.0/8 为私有", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("10.255.255.255")).toBe(true);
  });
  it("识别 172.16.0.0/12 为私有", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
  });
  it("172.15 和 172.32 不是私有（边界）", () => {
    expect(isPrivateIP("172.15.0.1")).toBe(false);
    expect(isPrivateIP("172.32.0.1")).toBe(false);
  });
  it("识别 192.168.0.0/16 为私有", () => {
    expect(isPrivateIP("192.168.1.1")).toBe(true);
  });
  it("识别 127.0.0.0/8 回环为私有", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
  });
  it("识别 169.254.0.0/16 链路本地为私有", () => {
    expect(isPrivateIP("169.254.1.1")).toBe(true);
  });
  it("识别 100.64.0.0/10 CGNAT 为私有", () => {
    expect(isPrivateIP("100.64.0.1")).toBe(true);
    expect(isPrivateIP("100.127.255.255")).toBe(true);
    expect(isPrivateIP("100.63.255.255")).toBe(false);
    expect(isPrivateIP("100.128.0.1")).toBe(false);
  });
  it("识别 0.0.0.0/8 为私有", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });
  it("识别 224.0.0.0/4 多播为私有", () => {
    expect(isPrivateIP("224.0.0.1")).toBe(true);
    expect(isPrivateIP("239.255.255.255")).toBe(true);
  });
  it("识别 255.255.255.255 有限广播为私有", () => {
    expect(isPrivateIP("255.255.255.255")).toBe(true);
  });
  it("公网 IP 不为私有", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("172.32.0.1")).toBe(false);
  });
  it("非法格式返回 false", () => {
    expect(isPrivateIP("not.an.ip")).toBe(false);
    expect(isPrivateIP("1.2.3")).toBe(false);
  });

  // IPv6
  it("识别 ::1 回环为私有", () => {
    expect(isPrivateIP("::1")).toBe(true);
  });
  it("识别 IPv4-mapped IPv6 ::ffff:127.0.0.1 为私有", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
  });
  it("识别 fc/fd 唯一本地为私有", () => {
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd00::1")).toBe(true);
  });
  it("识别 fe80 链路本地为私有", () => {
    expect(isPrivateIP("fe80::1")).toBe(true);
  });
  it("识别 ff 多播为私有", () => {
    expect(isPrivateIP("ff02::1")).toBe(true);
  });
});

describe("assertPathInAllowedDirs", () => {
  const winAllowed = ["c:\\users\\me\\"];
  const nixAllowed = ["/home/me/", "/tmp/"];

  it("路径在允许目录内不抛错（Windows 风格）", () => {
    expect(() => assertPathInAllowedDirs("C:\\Users\\me\\img.png", winAllowed)).not.toThrow();
  });
  it("路径在允许目录内不抛错（POSIX 风格）", () => {
    expect(() => assertPathInAllowedDirs("/home/me/sub/img.png", nixAllowed)).not.toThrow();
  });
  it("路径越界抛错（symlink 逃逸场景）", () => {
    expect(() => assertPathInAllowedDirs("C:\\Windows\\System32\\evil.dll", winAllowed)).toThrow(/outside the allowed directory/);
    expect(() => assertPathInAllowedDirs("/etc/passwd", nixAllowed)).toThrow(/outside the allowed directory/);
  });
  it("大小写不敏感比较（realPath 小写化比较）", () => {
    expect(() => assertPathInAllowedDirs("C:\\USERS\\ME\\img.png", winAllowed)).not.toThrow();
  });
  it("前缀伪造不通过（如 /home/meevil）", () => {
    expect(() => assertPathInAllowedDirs("/home/meevil/x", nixAllowed)).toThrow();
  });
});
