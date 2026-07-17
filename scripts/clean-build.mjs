import { rm } from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(process.cwd());
const buildDirectory = path.resolve(workspace, "build");
const relative = path.relative(workspace, buildDirectory);

if (relative !== "build" || path.basename(buildDirectory) !== "build") {
  throw new Error(`Refusing to clean unexpected path: ${buildDirectory}`);
}

await rm(buildDirectory, { recursive: true, force: true });
