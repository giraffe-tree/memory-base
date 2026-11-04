---
id: projects.letta.overview
title: 当前 Letta 的记忆逻辑运行在终端、Cloud 还是本地后端？
summary: 以 letta-code 当前实现为主线，区分 Agent harness、APIBackend、App Server 与进程内 LocalBackend。
project: letta
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - README.md
  - src/backend/backend-mode.ts
  - src/backend/backend.ts
  - src/backend/api/client.ts
  - src/backend/local/local-backend.ts
  - src/cli/subcommands/app-server.ts
  - src/tools/impl/memory.ts
---

## 先确定本次研究的对象

本手册的 Letta 章节跟踪 `letta-ai/letta-code` 当前 TypeScript 实现，固定 commit `e6d6cc27ef1111da80e919dc1cef179613894b66`，核验日期 2026-11-04。它是带持续身份、会话和记忆的 Agent harness，不是沿用旧 Python／MemGPT 归档层结构的源码说明。以下为静态源码核验，未启动 Cloud、模型提供商或完整本地服务。

当前仓库同时存在远程 API 和进程内执行路径。仅看终端程序运行在笔记本上，不能据此判断记忆、会话或模型调用都在本机完成。

## 四个位置分别负责什么

| 位置 | 已见实现 | 与记忆的关系 |
| --- | --- | --- |
| 终端／headless harness | 工具执行、会话编排、记忆 checkout 与同步 | 让模型使用文件和工具，衔接记忆版本与下一次调用 |
| `APIBackend` | Letta SDK／HTTP 请求适配 | 远程 Agent 与会话接口；本地代码不包含服务端所有实现 |
| `LocalBackend` | 继承 HeadlessBackend，组合 LocalStore 与 provider executor | Agent、transcript、MemFS 和提示编译可以在本进程管理 |
| App Server | 原生 v2 WebSocket 与可选兼容 HTTP 接口 | 为客户端提供运行入口，不能仅凭端口位置推导底层 backend |

[backend-mode.ts 的 `resolveBackendMode`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend-mode.ts) 未设置覆盖时选择 api，experimental 环境开关可选择 local；[README 的默认流程](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/README.md) 说明 Cloud 为默认，并允许用户保存本地选择。默认值、后续保存的选择和单次覆盖要分开记录。

## 一个项目决定怎样跨越这些位置

假设 Agent 学到“alpha 项目暂用 SQLite”。对话经历可以进入 transcript；如果它决定把约束保留给未来，会用文件工具编辑 MemFS，并提交 Git。根 core 文件用于未来提示，子目录详细材料按需读取。这个选择由 Agent、提示和运行编排共同完成，不等于有一个独立 ADD API 自动对所有消息提取事实。

[LocalBackend.createAgent](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-backend.ts) 在启用 MemFS 时准备 root marker、初始化本地 Git 记忆并编译初始提示。API 路径则发起远程创建、同步和重编译请求；它们的服务端保存方式与一致性不能完全由客户端推断。

## 当前记忆的三个组成部分

第一部分是有 Git 版本的 MemFS：根 `MEMORY.md` 与顶层 Markdown 构成核心记忆，子目录是延后读取的知识。第二部分是持久会话经历，作为 recall 搜索材料。第三部分是当前调用实际收到的提示与在上下文内的消息，两者会受编译和压缩影响。

[Memory 工具的 `memory`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) 按路径打开 deferred 内容，不能把它直接等同于 Mem0 的向量事实 search。文件落盘、Git 提交、同步、提示更新和读取工具返回也是不同事件。

## 可本地运行，不等于所有能力相同

[backend.ts 的 `BackendCapabilities`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend.ts) 显式区分 `localMemfs`、`remoteMemfs`、`promptRecompile` 等能力。LocalBackend 有实际可读实现；Cloud 的远程服务只有部分接口与客户端控制流可见，不能因此称其完整服务端已经开源。

[App Server 子命令](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/subcommands/app-server.ts) 能在本地监听 WebSocket，并可开启 OpenAI 兼容路由。这证明有本地服务入口，不代表它自动替换所选后端、模型或认证。评审部署时应记录客户端、harness、backend、provider 四者实际位置。

这种边界也影响与独立记忆库的比较。若给三个项目都发送一句话，Letta 的结果还受 Agent 当前身份、系统提示、工具集合与会话状态影响；不能把它当成一个只接收文本、返回事实列表的纯函数。公平的实验应先约定目标是持续协作、知识保存还是检索接口，再记录具体运行表面和有效输入，而不是仅对比同名功能按钮。

## 源码定位

- `src/backend/backend.ts`：`APIBackend`、`getBackend`、`configureBackendMode`，负责实现选择与能力边界。
- `src/backend/local/local-backend.ts`：`LocalBackend`，本轮本地记忆和提示编译的主要证据。
- `src/backend/api/client.ts`：`getClient`，证据范围是远程客户端配置，不能替代远端存储实现。

## 自测

1. 本地启动一个 App Server，为什么还不能断言所有记忆和模型执行都在本机？
2. APIBackend 客户端可读与 LocalBackend 实现可读，分别允许得出哪些结论？
