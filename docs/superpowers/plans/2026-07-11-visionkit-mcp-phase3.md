# VisionKit MCP 期3实施计划

> 状态：核心实施完成；mimo-v2.5 真实回归完成；五家内置 provider live probe 待凭据

1. 建立 Provider 的统一请求、结果、能力和 transport 抽象。
2. 将六个 client 迁移到 `BaseVisionClient`，从 tool handler 到 MCP 注册改用 capabilities。
3. 在 `loadConfig()` 解析 capability overrides，登记仅已验证的 mimo-v2.5 capability profile。
4. 抽出 `media/security.ts`，使用可靠路径边界判断；对日志实现敏感信息脱敏。
5. 新增 fake transport/provider、安全、配置和日志契约测试，运行 typecheck、unit test、build。
6. 若用户确认消耗 API，再以 mimo-v2.5 做真实 MCP 回归；其他 provider 留待获得凭据后验证。

## 完成证据

- `npm run typecheck`：通过。
- `npm run test:unit`：12个测试文件、105个用例通过，包含远程图片 SSRF/DNS pinning 确定性测试。
- `npm run build`：通过。
- `npm run test:phase3-mimo`：7个 MCP 工具真实调用通过，包含双图 `ui_diff_check`。
- 五家内置 provider 的 payload 已由 fake transport 契约测试锁定；真实能力 profile 仍保持保守值，等待凭据执行 live probe。
