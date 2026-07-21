# VisionKit MCP 图像分析超时问题复盘

**日期**：2026-07-21
**状态**：个人网络无法复现；公司网络待复核

## 现象

公司电脑通过 Claude Code 和项目级 `.mcp.json` 使用 VisionKit MCP 时，图片工具报告 `timeout of 60000ms exceeded`。

配置使用 GitHub npx、OpenAI 兼容中转端点与免费视觉模型。真实 API key 和具体中转地址已从本文移除；密钥一旦出现在聊天、日志或文档中，应立即轮换。

## 已完成的复核

- 在个人网络中，Windows curl 与 Node.js 均可正常完成 TLS 连接，未使用 `-k`。
- 同一中转站、API key 与模型配置通过 VisionKit v1.6.0 图片生产链路成功返回结果。
- 另一个免费视觉模型通过本地 stdio MCP 及 GitHub npx MCP 的 `image_analysis` 真实调用。
- 中转站曾出现一次快速上游 HTTP 500，随后恢复，说明免费模型路由可能存在独立波动。

## 结论

现有证据不能把公司电脑的超时归因于 VisionKit 配置或 Node.js TLS。Windows curl 的 Schannel 证书吊销错误不等同于 Node.js/axios 的行为；在 PowerShell 中使用 Bash 的反斜杠续行还可能导致 Authorization 请求头未实际发送。

当前优先怀疑：

1. 公司网络出口、HTTPS 代理、防火墙或终端安全软件拦截较大的 Base64 图片 POST 请求。
2. 公司环境中的 `HTTP_PROXY` / `HTTPS_PROXY` 或 npm proxy 配置改变了 Node.js 请求路径。
3. 免费模型排队或中转站上游响应偶发超过 VisionKit 当前固定的 60 秒请求超时。

## 公司电脑后续排查

1. 用手机热点复测；若热点成功而公司网络失败，可直接锁定网络环境。
2. 使用 Node.js 发起最小 OpenAI 兼容请求，避免仅依据 Windows curl 判断 VisionKit 行为。
3. 检查代理环境变量、npm proxy、公司根证书与安全软件网络日志。
4. 对照中转站访问日志，确认请求是未到达、上传阶段被中断，还是等待上游超时。
5. 不使用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 作为解决方案。

## 项目侧可改进项

- 增加可配置且有边界的模型请求超时。
- 保留 HTTP 状态、网络错误码、耗时与重试次数，避免错误归一化后丢失重试判据。
- 仅对 408、429、5xx 和明确的瞬时网络错误重试，不重试普通 4xx。
