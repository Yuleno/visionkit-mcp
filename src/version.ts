import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: unknown };

if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
  throw new Error("package.json is missing a valid version");
}

/** package.json 是服务版本的唯一事实源。 */
export const VERSION = packageJson.version;
export const GITHUB_NPX_SPEC = `github:Juvorix/visionkit-mcp#v${VERSION}`;
