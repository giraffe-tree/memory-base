---
id: projects.letta.integration-isolation
title: Cloud SDK、本地 AppServer 与 local backend 怎样区分？
summary: AppServer 是本地宿主协议，local backend 是推理与存储实现；连接鉴权、actor 归属和文件权限是不同边界。
project: letta
minutes: 10
status: source_verified
prerequisites: [projects.letta.overview, projects.letta.runtime-consistency]
sources: [src/backend/api/client.ts, src/backend/api/server-url.ts, src/backend/api/memfs-git-proxy.ts, src/backend/backend.ts, src/websocket/app-server.ts, src/websocket/app-server-auth.ts, src/app-server-client.ts, src/backend/local/local-backend.ts, src/backend/local/initial-memory.ts, src/tools/impl/memory.ts, src/runtime-context.ts]
---

## 结论：协议入口不决定数据在哪里执行

`letta-code` 当前既能通过 SDK 调用 Cloud，也能作为本地 AppServer 接收 WebSocket 命令，还包含显式启用的 local backend。AppServer 本身不是旧 Python Letta 服务的替代实现；启动本地端口也不等于模型、记忆与反思都转成本地运行。

本页固定 `e6d6cc27ef11`。Cloud API 的具体授权、数据库事务与记忆编译逻辑不在本仓库内，只能据客户端请求说明边界，不能替服务端宣称保证。

## 三层接入放在一起看

| 层 | 当前作用 | 不应混淆的概念 |
| --- | --- | --- |
| Cloud SDK / ApiBackend | 使用 `@letta-ai/letta-client` 调用 agent、conversation 等 API | SDK 函数调用会变成 HTTP，请求成功不等于读到了服务端源码 |
| AppServer | 在本机管理 listener，提供一条双向 WebSocket 和可选 HTTP 兼容入口 | 控制连接与后端推理/存储是两层选择 |
| LocalBackend | 进程内执行模型适配、会话持久化与本地 MemFS 编译 | 可使用远端模型 provider，不等于零网络或 Cloud 能力齐全 |

默认 API 地址由 `LETTA_BASE_URL`、settings 和 Cloud 默认值解析；MemFS Git canonical URL 另有配置，不能仅修改一个 base URL 就认定所有通信被转移。Cloud 模式下模型选择、计算机路由和服务端执行也需按具体请求追踪。

`getClient` 还接入 OAuth 刷新、Desktop 凭据与组织凭据绑定。它们服务于 Cloud API 调用，不能用 AppServer 的连接令牌直接替代。接入排障需要区分本机 socket 认证失败、Cloud API 拒绝和模型 provider 凭据失效，而不把所有 401 都归为同一种权限问题。

## AppServer 的实际认证

`startAppServer` 默认监听 `ws://127.0.0.1:0`，让系统分配端口。可配置 capability-token，或以共享 secret 校验 HS256 signed bearer；后者检查签名、exp/nbf，以及配置过的 issuer、audience。

无认证的非 loopback 监听会直接拒绝启动。HTTP 请求含 Origin 一律被拒绝；WebSocket upgrade 含 Origin 时，必须存在配置好的认证策略。浏览器原生 WebSocket 不能自由设置 Authorization header，因此不能因为客户端类支持 token，就认定任何网页都能原样接入。

`AppServerClient` 使用同一个双向 socket 承载控制与流事件，通过 request_id 关联待响应请求，默认等待三十秒。可选 OpenAI-compatible HTTP 入口也复用认证策略；它不是一个通用模型服务器的全部接口实现，具体支持范围以 capability 与路由为准。

## 连接令牌与业务身份不是同一件事

AppServer capability token 允许持有者连接宿主；signed bearer 验证的是所列 token claims。不能由此推断实现了每个 agent 的独立租户授权。运行时另有 agent_id、conversation_id、acting_user_id，后者可被带入 Cloud 请求，以维持调用归属；Cloud 最终怎样验证它，要看服务端与凭据权限。

本地进程拥有 provider 凭据和文件工具能力。若不互信的调用者共享一个 AppServer，仍需要明确可选 agent、工作目录、工具批准与凭据边界，不能把随机 ID、目录命名或一枚连接 token 当作完整的租户隔离证明。

## Memory 工具与 memory blocks 的接线

当前 `Memory()` 是渐进读取工具：root core memory 已在上下文，子目录的 `MEMORY.md` 与直接子项按需返回。工具拒绝根目录重读、隐藏段、`..` 和越过真实根路径的目标，`skills/` 使用独立入口。写入由文件工具或管理命令完成，不能把 Memory 工具名字理解成远端记忆 CRUD 服务。

创建请求仍有 `memory_blocks` 结构，本地 `initialMemoryFilesFromCreateBody` 将它转为 root MemFS 文件，补默认 `MEMORY.md` 并处理路径碰撞。这证明 block 概念参与创建兼容，不证明当前系统必须沿用旧“core/archival 向量库”的架构。Cloud block 操作和本地文件投影要分别追踪。

## 源码定位

- [Cloud SDK 与凭据绑定](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/client.ts) · [API backend](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend.ts)。
- [AppServer 启动、Origin 与 HTTP/WS 路由](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/app-server.ts)。
- [令牌与 JWT 验证](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/app-server-auth.ts)：`authorizeUpgrade`、`policyFromSettings`。
- [单 socket 客户端](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/app-server-client.ts)：`AppServerClient`。
- [block 到本地文件的映射](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/initial-memory.ts) · [渐进记忆读取](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts)。

本页未登录 Cloud、配置真实 AppServer token 或尝试跨用户访问。

## 自测

1. 本机运行 AppServer，为什么仍可能向 Cloud API 与远端模型通信？
2. 连接认证、acting user、agent 目录与文件工具批准分别回答什么权限问题？
