# visionkit-mcp 期1 实施计划:仓库初始化 + 安全基线

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 luma-mcp 为起点建立 visionkit-mcp 新仓库,完成改名(LumaConfig→VisionKitConfig)、搭建 vitest 测试骨架、并把现有安全逻辑(isPrivateIP + 路径校验)抽为纯函数并用回归测试锁住,为后续期2-5 打好地基。

**Architecture:** 本地新建 visionkit-mcp 目录(不依赖 git),复制 luma 源码为起点。期1 只做:改名、加 vitest、抽纯函数安全逻辑 + 回归测试。**不改任何业务行为**(image-processor 的安全函数只是换文件位置,image-processor 改为 import)。不引入 BaseClient / 工具层 / 策略层(那是期2-3)。

**Tech Stack:** TypeScript 5.7 (ESM), Node >=18, vitest(新增), sharp, axios, zod, @modelcontextprotocol/sdk 1.25

## Global Constraints

(摘自 spec `docs/superpowers/specs/2026-07-09-visionkit-mcp-design.md`)
- 包名/bin 改为 `visionkit-mcp`,配置 key 沿用各家名(`ZHIPU_API_KEY` 等),新增覆盖变量用 `VISIONKIT_*` 前缀(本期内暂不引入,期3 用)
- `LumaConfig` 全局重命名为 `VisionKitConfig`(所有引用同步)
- License MIT,README/NOTICE 注明基于 luma-mcp(JochenYang)与 Pelican0126/vision-mcp 改造
- 期1 安全改动:**只移动位置不改行为**;`isPrivateIP` 与路径校验抽到 `media/security-utils.ts` 作为纯函数;`fetchRemoteImage` 保持原位(网络测试留期3)
- 不提交 git(用户环境文件加密,git 用处不大)
- 平台 Windows 11,shell 用 PowerShell;POSIX 脚本可用 Bash 工具

---

## File Structure(期1 产出)

```
E:/MyProjects/visionkit-mcp/                    # 新仓库根(与 luma-mcp 平级)
├── src/
│   ├── index.ts                 # 改:无业务改动(仅 import 路径调整)
│   ├── config.ts                # 改:LumaConfig → VisionKitConfig
│   ├── constants.ts             # 沿用
│   ├── vision-client.ts         # 沿用(LumaConfig 引用改名)
│   ├── zhipu-client.ts          # 改:LumaConfig 引用改名
│   ├── siliconflow-client.ts    # 改:同上
│   ├── qwen-client.ts           # 改:同上
│   ├── volcengine-client.ts     # 改:同上
│   ├── hunyuan-client.ts        # 改:同上
│   ├── custom-client.ts         # 改:同上
│   ├── image-processor.ts       # 改:isPrivateIP + 路径校验改为 import security-utils
│   ├── media/
│   │   └── security-utils.ts    # 新建:isPrivateIP + assertPathInAllowedDirs 纯函数
│   └── utils/{helpers.ts, logger.ts}   # 沿用
├── test/
│   ├── test-local.ts            # 复制(沿用)
│   └── unit/
│       └── security-utils.test.ts   # 新建:回归测试
├── package.json                 # 改:name/bin/author/repo/scripts
├── tsconfig.json                # 复制
├── tsconfig.check.json          # 复制
├── vitest.config.ts             # 新建
├── README.md                    # 改写
└── NOTICE                       # 新建:归属声明
```

**说明:** 期1 不创建 spec 终态目录里的 `providers/`、`tools/`、`detail-strategy.ts`、`execution-strategy.ts`、`security.ts`(这些是期2-3 产物)。期1 只新建 `media/security-utils.ts`(纯函数抽取的过渡位置,期3 会演进成 `security.ts`)。

---

## Task 1: 创建新仓库骨架(复制 luma 源码)

**Files:**
- Create: `E:/MyProjects/visionkit-mcp/`(整个目录,从 luma-mcp 复制)

**Interfaces:** 无(纯文件复制)

- [ ] **Step 1: 复制 luma-mcp 源码到新目录**

Run(PowerShell):
```powershell
Copy-Item -Path "E:\MyProjects\luma-mcp\src" -Destination "E:\MyProjects\visionkit-mcp\src" -Recurse
Copy-Item -Path "E:\MyProjects\luma-mcp\test" -Destination "E:\MyProjects\visionkit-mcp\test" -Recurse
Copy-Item -Path "E:\MyProjects\luma-mcp\package.json" -Destination "E:\MyProjects\visionkit-mcp\package.json"
Copy-Item -Path "E:\MyProjects\luma-mcp\tsconfig.json" -Destination "E:\MyProjects\visionkit-mcp\tsconfig.json"
Copy-Item -Path "E:\MyProjects\luma-mcp\tsconfig.check.json" -Destination "E:\MyProjects\visionkit-mcp\tsconfig.check.json"
Copy-Item -Path "E:\MyProjects\luma-mcp\README.md" -Destination "E:\MyProjects\visionkit-mcp\README.md"
```
Expected: `E:\MyProjects\visionkit-mcp\` 下有 src/ test/ package.json tsconfig*.json README.md

- [ ] **Step 2: 验证复制完整**

Run:
```powershell
Get-ChildItem -Path "E:\MyProjects\visionkit-mcp\src" -Recurse -File | Measure-Object | Select-Object Count
Get-ChildItem -Path "E:\MyProjects\visionkit-mcp\src" -Recurse -File -Filter *.ts | Select-Object Name
```
Expected: 13 个 .ts 文件(index/config/constants/vision-client/6 个 client/image-processor/utils/helpers/utils/logger)

> 不复制 `build/`、`node_modules/`、`docs/`、`.git/`。

---

## Task 2: 安装依赖 + 加 vitest

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/package.json`(scripts + devDeps)
- Create: `E:/MyProjects/visionkit-mcp/vitest.config.ts`

**Interfaces:** 无

- [ ] **Step 1: 安装依赖(含 vitest)**

Run(在新仓库目录):
```powershell
cd E:\MyProjects\visionkit-mcp
npm install
npm install -D vitest
```
Expected: `node_modules/` 生成,vitest 装好

- [ ] **Step 2: 创建 vitest.config.ts**

Create `E:/MyProjects/visionkit-mcp/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: 修改 package.json 的 scripts**

Modify `E:/MyProjects/visionkit-mcp/package.json`,把 `scripts` 块改为:
```json
"scripts": {
  "build": "tsc",
  "watch": "tsc --watch",
  "prepare": "npm run build",
  "typecheck": "tsc -p tsconfig.check.json",
  "test:unit": "vitest run",
  "test:local": "tsx test/test-local.ts"
},
```

- [ ] **Step 4: 验证 vitest 可跑(暂无测试,应 0 通过)**

Run:
```powershell
npm run test:unit
```
Expected: vitest 启动,报告 "No test files found" 或 0 passed(非错误退出即可)

---

## Task 3: 改 package.json 元信息(改名 + 归属)

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/package.json`

**Interfaces:** 无

- [ ] **Step 1: 改 name/description/bin/author/repo**

Modify `E:/MyProjects/visionkit-mcp/package.json`:
- `"name": "luma-mcp"` → `"name": "visionkit-mcp"`
- `"description"` 改为:`"Multi-model vision understanding MCP server with specialized tools (UI-to-code, OCR, error diagnosis, diagram, chart, UI diff). Forked from luma-mcp."`
- `"bin": { "luma-mcp": "build/index.js" }` → `"bin": { "visionkit-mcp": "build/index.js" }`
- `"author": "Jochen"` → `"author": "jinyu"`
- `repository.url` → `"git+https://github.com/jinyu/visionkit-mcp.git"`(占位,实际 repo 待定)
- `bugs.url` / `homepage` 同步改为 visionkit-mcp 路径
- `keywords` 数组末尾追加 `"visionkit"`、`"specialized-tools"`

- [ ] **Step 2: 验证 package.json 合法**

Run:
```powershell
node -e "JSON.parse(require('fs').readFileSync('E:/MyProjects/visionkit-mcp/package.json','utf8')); console.log('ok')"
```
Expected: 输出 `ok`

---

## Task 4: 新建 NOTICE 归属声明

**Files:**
- Create: `E:/MyProjects/visionkit-mcp/NOTICE`

**Interfaces:** 无

- [ ] **Step 1: 写 NOTICE**

Create `E:/MyProjects/visionkit-mcp/NOTICE`:
```
visionkit-mcp
Copyright (c) 2026 jinyu

本项目基于以下开源项目改造(MIT 协议):

- luma-mcp  https://github.com/JochenYang/luma-mcp
  Copyright (c) JochenYang
- vision-mcp  https://github.com/Pelican0126/vision-mcp
  Copyright (c) Pelican0126

感谢原作者的贡献。本项目沿用 MIT 协议。
```

---

## Task 5: 抽取 isPrivateIP 到 security-utils.ts(纯函数)

**Files:**
- Create: `E:/MyProjects/visionkit-mcp/src/media/security-utils.ts`
- Modify: `E:/MyProjects/visionkit-mcp/src/image-processor.ts`(删除 isPrivateIP 定义,改为 import)

**Interfaces:**
- Produces: `export function isPrivateIP(ip: string): boolean`(被 image-processor.ts 与测试使用)

- [ ] **Step 1: 创建 security-utils.ts,把 isPrivateIP 原样搬过去**

Create `E:/MyProjects/visionkit-mcp/src/media/security-utils.ts`,内容是把 image-processor.ts:147-202 的 `isPrivateIP` 函数原样复制(含 `isIPv6` 的使用)。注意:image-processor 里有 `isIPv6` 的来源(从 `node:net` import),新文件也要 import。完整内容:

```ts
/**
 * 安全相关纯函数(从 image-processor 抽出,便于测试)
 * 期1 只移动位置,不改行为。期3 会演进为完整的 security.ts(含可注入 dns/http/fs)。
 */
import { isIPv6 } from "node:net";

/**
 * 检查 IP 地址是否为私有/内网地址(SSRF 防护用)
 */
export function isPrivateIP(ip: string): boolean {
  // IPv6 回环地址
  if (ip === "::1") {
    return true;
  }

  // IPv4-mapped IPv6 地址(如 ::ffff:127.0.0.1)
  if (isIPv6(ip)) {
    const v4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Match) {
      return isPrivateIP(v4Match[1]);
    }
    // fc00::/7 — 唯一本地地址(IPv6 私有地址)
    // fe80::/10 — 链路本地地址
    // ff00::/8 — 多播地址
    const lowerIp = ip.toLowerCase();
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lowerIp)) return true;
    if (lowerIp.startsWith("ff")) return true;
    return false;
  }

  // IPv4 地址检查
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);

  // 0.0.0.0/8
  if (first === 0) return true;
  // 127.0.0.0/8
  if (first === 127) return true;
  // 10.0.0.0/8
  if (first === 10) return true;
  // 172.16.0.0/12
  if (first === 172 && second >= 16 && second <= 31) return true;
  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;
  // 169.254.0.0/16
  if (first === 169 && second === 254) return true;
  // 100.64.0.0/10 (CGNAT)
  if (first === 100 && second >= 64 && second <= 127) return true;
  // 224.0.0.0/4 (多播)
  if (first >= 224 && first <= 239) return true;
  // 255.255.255.255 (有限广播)
  if (first === 255 && second === 255) {
    const third = parseInt(parts[2], 10);
    const fourth = parseInt(parts[3], 10);
    if (third === 255 && fourth === 255) return true;
  }

  return false;
}
```

- [ ] **Step 2: 从 image-processor.ts 删除原 isPrivateIP 定义**

Modify `E:/MyProjects/visionkit-mcp/src/image-processor.ts`:
- 删除 147-202 行的整个 `function isPrivateIP(...)` 定义
- 在文件顶部 import 区追加:
```ts
import { isPrivateIP } from "./media/security-utils.js";
```
(image-processor.ts 在 src/ 根,security-utils.ts 在 src/media/,所以是 `./media/security-utils.js`)

- [ ] **Step 3: 检查 image-processor.ts 是否还 import 了 isIPv6 仅供 isPrivateIP 用**

Run:
```powershell
Select-String -Path "E:\MyProjects\visionkit-mcp\src\image-processor.ts" -Pattern "isIPv6" | Select-Object LineNumber, Line
```
Expected: 若 isIPv6 在删除 isPrivateIP 后不再被其他地方使用,需从 image-processor.ts 的 import 中移除 `isIPv6`(保留 `isIP` 若有用)。检查后人工决定保留或删除该 import 项。

- [ ] **Step 4: typecheck 验证**

Run:
```powershell
npm run typecheck
```
Expected: 0 errors

---

## Task 6: 抽取路径校验到 security-utils.ts

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/src/media/security-utils.ts`(追加函数)
- Modify: `E:/MyProjects/visionkit-mcp/src/image-processor.ts`(loadImageBuffer 改用新函数)

**Interfaces:**
- Produces: `export function assertPathInAllowedDirs(realPath: string, allowedDirs: string[]): void`(纯校验,不碰 fs;fs 操作 realpath/readFile 留在 image-processor)

- [ ] **Step 1: 在 security-utils.ts 追加路径校验纯函数**

把 image-processor.ts `loadImageBuffer` 里的"realPath vs allowedDirs"比较逻辑(image-processor.ts:331-343)抽成纯函数。追加到 `E:/MyProjects/visionkit-mcp/src/media/security-utils.ts`:

```ts
/**
 * 校验真实路径是否在允许目录范围内(路径遍历/symlink 逃逸防护)。
 * 纯函数:只比较字符串,不碰 fs。realpath/readFile 由调用方先做。
 * allowedDirs 应为已 normalize + lowercase 的目录绝对路径。
 */
export function assertPathInAllowedDirs(
  realPath: string,
  allowedDirs: string[]
): void {
  const isAllowed = allowedDirs.some((dir) =>
    realPath.toLowerCase().startsWith(dir)
  );
  if (!isAllowed) {
    throw new Error(
      "Access denied: image path is outside the allowed directory"
    );
  }
}
```

- [ ] **Step 2: 修改 image-processor.ts 的 loadImageBuffer 用新函数**

Modify `E:/MyProjects/visionkit-mcp/src/image-processor.ts`,把 loadImageBuffer 里这段(image-processor.ts:331-343):

```ts
  const allowedDirs = [process.cwd(), os.homedir()].map((dir) =>
    path.normalize(dir).toLowerCase()
  );

  const isAllowed = allowedDirs.some((dir) =>
    realPath.toLowerCase().startsWith(dir)
  );

  if (!isAllowed) {
    throw new Error(
      "Access denied: image path is outside the allowed directory"
    );
  }
```

改为:

```ts
  const allowedDirs = [process.cwd(), os.homedir()].map((dir) =>
    path.normalize(dir).toLowerCase()
  );

  assertPathInAllowedDirs(realPath, allowedDirs);
```

并把顶部 import 补全:
```ts
import { isPrivateIP, assertPathInAllowedDirs } from "./media/security-utils.js";
```

- [ ] **Step 3: typecheck 验证**

Run:
```powershell
npm run typecheck
```
Expected: 0 errors

- [ ] **Step 4: build 验证(确保运行时 import 路径对)**

Run:
```powershell
npm run build
```
Expected: build/ 生成,0 errors

---

## Task 7: 写 isPrivateIP 回归测试(TDD - 先写测试)

**Files:**
- Create: `E:/MyProjects/visionkit-mcp/test/unit/security-utils.test.ts`

**Interfaces:**
- Consumes: `isPrivateIP` from `src/media/security-utils.ts`

- [ ] **Step 1: 写测试文件**

Create `E:/MyProjects/visionkit-mcp/test/unit/security-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPrivateIP } from "../../src/media/security-utils.js";

describe("isPrivateIP", () => {
  // IPv4 私有段(锁住 luma 现有行为)
  it("识别 10.0.0.0/8 为私有", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("10.255.255.255")).toBe(true);
  });
  it("识别 172.16.0.0/12 为私有", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
  });
  it("172.15 和 172.32 不是私有(边界)", () => {
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
```

- [ ] **Step 2: 跑测试验证通过**

Run:
```powershell
npm run test:unit
```
Expected: 全部 PASS(因为 Task 5 已实现 isPrivateIP)

> 注:此处测试与实现并存,因为是"锁住现有行为"的回归测试(实现已从 luma 搬过来),TDD 的红→绿在此 Task 体现为 Task 5 抽取在前、本 Task 验证。若想严格 TDD,可在 Task 5 抽取后立即跑本测试看绿。

---

## Task 8: 写 assertPathInAllowedDirs 回归测试

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/test/unit/security-utils.test.ts`(追加 describe)

**Interfaces:**
- Consumes: `assertPathInAllowedDirs` from `src/media/security-utils.ts`

- [ ] **Step 1: 追加测试**

在 `E:/MyProjects/visionkit-mcp/test/unit/security-utils.test.ts` 顶部 import 改为:
```ts
import { isPrivateIP, assertPathInAllowedDirs } from "../../src/media/security-utils.js";
```
文件末尾追加:

```ts
describe("assertPathInAllowedDirs", () => {
  const winAllowed = ["c:\\users\\me\\"];
  const nixAllowed = ["/home/me/", "/tmp/"];

  it("路径在允许目录内不抛错(Windows 风格)", () => {
    expect(() => assertPathInAllowedDirs("C:\\Users\\me\\img.png", winAllowed)).not.toThrow();
  });
  it("路径在允许目录内不抛错(POSIX 风格)", () => {
    expect(() => assertPathInAllowedDirs("/home/me/sub/img.png", nixAllowed)).not.toThrow();
  });
  it("路径越界抛错(symlink 逃逸场景)", () => {
    expect(() => assertPathInAllowedDirs("C:\\Windows\\System32\\evil.dll", winAllowed)).toThrow(/outside the allowed directory/);
    expect(() => assertPathInAllowedDirs("/etc/passwd", nixAllowed)).toThrow(/outside the allowed directory/);
  });
  it("大小写不敏感比较(realPath 小写化比较)", () => {
    expect(() => assertPathInAllowedDirs("C:\\USERS\\ME\\img.png", winAllowed)).not.toThrow();
  });
  it("前缀伪造不通过(如 /home/meevil)", () => {
    expect(() => assertPathInAllowedDirs("/home/meevil/x", nixAllowed)).toThrow();
  });
});
```

- [ ] **Step 2: 跑全部测试**

Run:
```powershell
npm run test:unit
```
Expected: 全部 PASS

---

## Task 9: LumaConfig → VisionKitConfig 全局重命名

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/src/config.ts`
- Modify: 所有 `*-client.ts`(6 个)、`vision-client.ts`、`index.ts`、`custom-client.ts`

**Interfaces:**
- Produces: `interface VisionKitConfig`(取代 LumaConfig)、`function loadConfig(): VisionKitConfig`

- [ ] **Step 1: 找出所有 LumaConfig 引用**

Run:
```powershell
Select-String -Path "E:\MyProjects\visionkit-mcp\src\*.ts" -Pattern "LumaConfig" -CaseSensitive | Select-Object Filename, LineNumber, Line
```
Expected: 列出 config.ts(定义)、各 client、vision-client、index 中的引用

- [ ] **Step 2: 逐文件替换 LumaConfig → VisionKitConfig**

对上一步列出的每个文件,把所有 `LumaConfig` 替换为 `VisionKitConfig`。config.ts 的 interface 定义行改为:
```ts
export interface VisionKitConfig {
```
各 client 构造函数参数类型 `config: LumaConfig` → `config: VisionKitConfig`。

可用 PowerShell 批量替换(注意只改 src/ 下):
```powershell
Get-ChildItem -Path "E:\MyProjects\visionkit-mcp\src" -Recurse -Filter *.ts | ForEach-Object {
  (Get-Content $_.FullName) -replace 'LumaConfig', 'VisionKitConfig' | Set-Content $_.FullName
}
```

- [ ] **Step 3: 验证无残留 LumaConfig**

Run:
```powershell
Select-String -Path "E:\MyProjects\visionkit-mcp\src\*.ts" -Pattern "LumaConfig" -CaseSensitive
```
Expected: 无输出(全部已替换)

- [ ] **Step 4: typecheck + build**

Run:
```powershell
npm run typecheck
npm run build
```
Expected: 0 errors

> 注:`loadConfig` 函数名本期保留不变(spec 未要求改函数名,只改类型名)。本期不引入 `capabilityOverrides` 字段(那是期3)。

---

## Task 10: 改写 README

**Files:**
- Modify: `E:/MyProjects/visionkit-mcp/README.md`

**Interfaces:** 无

- [ ] **Step 1: 重写 README 头部 + 归属说明**

把 `E:/MyProjects/visionkit-mcp/README.md` 开头改为(保留原有的安装/配置/使用说明主体,仅改头部和归属):

```markdown
# VisionKit MCP

多模型视觉理解 MCP 服务器,为不支持原生视觉能力的 AI 助手提供专项工具集(UI 转代码、OCR、报错诊断、技术图理解、数据可视化、UI 对比、通用分析)。

[English](./docs/README_EN.md) | 中文

> **本项目基于 [luma-mcp](https://github.com/JochenYang/luma-mcp)(JochenYang)与 [vision-mcp](https://github.com/Pelican0126/vision-mcp)(Pelican0126)改造,MIT 协议。** 详见 [NOTICE](./NOTICE)。

## 当前进度(期1)

期1 完成:仓库初始化、LumaConfig→VisionKitConfig 改名、vitest 测试骨架、安全逻辑(isPrivateIP + 路径校验)抽取与回归测试。

后续期次(专项工具集、Provider 重构、Agentic Zoom、视频)开发中,见 [设计文档](./docs/superpowers/specs/2026-07-09-visionkit-mcp-design.md)。

## 特性

(以下为 luma 原有特性,后续期次将扩展)
- 多模型支持:GLM-4.6V、DeepSeek-OCR、Qwen3-VL-Flash、Doubao-Seed-1.6、Hunyuan-Vision-1.5
- ... (保留 luma 原有特性列表)
```

> 注:README 主体(安装、配置、使用)沿用 luma 内容,本步骤只改头部 + 加进度/归属说明。`image_understand` → `image_analysis` 的迁移说明在期2 README 更新时再加(本期还没实现 image_analysis)。

- [ ] **Step 2: 验证 README 存在且非空**

Run:
```powershell
(Get-Content "E:\MyProjects\visionkit-mcp\README.md" | Measure-Object).Count
```
Expected: 行数 > 0

---

## Task 11: 期1 验收

**Files:** 无(整体验收)

**Interfaces:** 无

- [ ] **Step 1: typecheck 通过**

Run:
```powershell
npm run typecheck
```
Expected: 0 errors

- [ ] **Step 2: build 通过**

Run:
```powershell
npm run build
```
Expected: build/ 生成

- [ ] **Step 3: 单元测试全绿**

Run:
```powershell
npm run test:unit
```
Expected: 所有 isPrivateIP + assertPathInAllowedDirs 测试 PASS

- [ ] **Step 4: 冒烟启动测试(无 key 也能起)**

Run:
```powershell
node build/index.js
```
Expected: server 启动到 stdio(不报错,等待 MCP 输入;Ctrl+C 退出)。缺 API key 应能启动(spec 约定延迟报错)。

- [ ] **Step 5: 删除 build/(产物不入库)**

Run:
```powershell
Remove-Item -Recurse -Force "E:\MyProjects\visionkit-mcp\build"
```
Expected: build/ 删除(保持源码仓库干净;每次 build 重新生成)

- [ ] **Step 6: 期1 完成确认**

确认以下交付物:
- [ ] 新仓库 `E:/MyProjects/visionkit-mcp/` 建立,name/bin 改名
- [ ] vitest 骨架 + test:unit 脚本
- [ ] NOTICE 归属
- [ ] isPrivateIP + assertPathInAllowedDirs 抽到 media/security-utils.ts
- [ ] 回归测试全绿
- [ ] LumaConfig → VisionKitConfig 全局改名
- [ ] typecheck + build 通过

---

## Self-Review 自审记录

**1. Spec 覆盖:** 期1 spec 范围(6.1 期1 行:改名、NOTICE、build/vitest 骨架、test:unit/test:smoke 脚本、security 黑盒回归不移动逻辑)→ Task 1-11 全覆盖。test:smoke 脚本本期用 test:local 代替(spec 6.5 的 test:smoke 是期2+ 产物,luma 已有 test:local 满足本期冒烟需求,已在 Task 2 保留)。security 黑盒不移动逻辑 → 采用方案2(纯函数抽取),与用户选择一致。

**2. 占位符扫描:** 无 TBD/TODO。Task 3 的 repo url 标注"占位,实际 repo 待定"是合理的(用户未定 repo),非实现占位。Task 10 README 注明"保留 luma 原有特性列表"是合理的精简指引(主体沿用),非占位。

**3. 类型一致性:** `isPrivateIP(ip: string): boolean`、`assertPathInAllowedDirs(realPath, allowedDirs): void`、`VisionKitConfig` 三个产出在定义(Task 5/6/9)与消费(Task 7/8/各 client)中签名一致。import 路径 `./media/security-utils.js`(image-processor 在 src/ 根)与 `../../src/media/security-utils.js`(测试在 test/unit/)核对正确。

**4. 跨期边界:** 本计划严格不碰期2-5 产物(无 tools/、providers/、detail-strategy、BaseClient、capabilityOverrides、image_analysis)。期1 完成后,visionkit-mcp 行为与 luma 完全一致(仅改名 + 测试 + 安全函数换位置),可正常作为期2 起点。
