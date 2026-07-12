#!/usr/bin/env node

/**
 * VisionKit MCP Server
 * 通用图像理解 MCP 服务器，支持多家视觉模型提供商
 */

// 第一件事：重定向console到stderr，避免污染MCP的stdout
import { setupConsoleRedirection, logger } from "./utils/logger.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { runConfigureCli } from "./configure-cli.js";
import { loadConfig } from "./config.js";
import { createClient } from "./providers/registry.js";
import { TOOL_DEFS } from "./tools/definitions.js";
import { makeHandler } from "./tools/handler.js";
import { makeVideoHandler } from "./tools/video-handler.js";

/**
 * 创建 MCP 服务器
 */
async function createServer() {
  logger.info("Initializing VisionKit MCP Server");

  // 加载配置
  const config = loadConfig();

  // 根据配置选择模型客户端（createClient 工厂 + CLIENT_REGISTRY 在 src/providers/registry.ts）
  const visionClient = createClient(config);

  logger.info("Vision client initialized", {
    provider: config.provider,
    model: visionClient.getModelName(),
    multiCrop: config.multiCrop,
    multiCropMaxTiles: config.multiCropMaxTiles,
  });

  // 创建服务器 - 使用 McpServer
  const server = new McpServer(
    {
      name: "visionkit-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 数据驱动注册：按真实 provider/model capabilities 过滤。
  // multiCrop 关闭时继续收紧为单图，但不把未验证的后端能力放大。
  const capabilities = {
    ...visionClient.capabilities,
    maxImages: config.multiCrop
      ? Math.min(visionClient.capabilities.maxImages, config.multiCropMaxTiles)
      : 1,
  };
  for (const def of TOOL_DEFS) {
    if (
      def.requiredCapabilities?.minImages &&
      capabilities.maxImages < def.requiredCapabilities.minImages
    ) {
      logger.warn(
        `工具 ${def.name} 未注册: maxImages(${capabilities.maxImages}) < 需求(${def.requiredCapabilities.minImages})`
      );
      continue;
    }
    // cast: makeHandler 返回的 StructuredSuccess 是闭合 interface(无 index signature),
    // 与 SDK CallToolResult(带 [x:string]:unknown)直接赋值会报 TS2769。
    // 期3 用 registerTool + outputSchema 后可消除此 cast。
    server.tool(
      def.name,
      def.description,
      def.inputShape,
      (def.media === "video"
        ? makeVideoHandler(visionClient, config, capabilities.maxImages)
        : makeHandler(def, visionClient, config, capabilities)) as never
    );
  }

  return server;
}

/**
 * 主函数
 */
async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("VisionKit MCP server started successfully on stdio");
  } catch (error) {
    logger.error("Failed to start VisionKit MCP server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// 全局错误处理
function installServerProcessHandlers() {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
    process.exit(1);
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    process.exit(0);
  });
}

if (process.argv[2] === "configure") {
  runConfigureCli().catch((error) => {
    process.stderr.write(
      `Configuration failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
} else {
  setupConsoleRedirection();
  installServerProcessHandlers();
  main();
}
