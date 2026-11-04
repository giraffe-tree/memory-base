---
id: projects.letta.evaluation-observability
title: 怎样确认记忆被使用，而不只看到 Dreaming 或同步通知？
summary: 把文件、Git、模型输入、反思回执与最终回答分层观察；当前测试与遥测不能替代真实记忆质量实验。
project: letta
minutes: 9
status: source_verified
prerequisites: [projects.letta.retrieval-context, projects.letta.updates-forgetting]
sources: [src/agent/memory-filesystem.sync.integration.test.ts, src/websocket/app-server-dream.test.ts, src/backend/api/reflection-runs.ts, src/backend/local/system-prompt-compilation.ts, src/agent/system-prompt-size.ts, src/web/context-usage.ts, src/telemetry/index.ts, src/telemetry/event-queue.ts, src/backend/local/local-transcript.test.ts]
---

## 结论：可观察的执行状态不等于知识正确

本轮核验 `e6d6cc27ef11` 的源码与测试定义，没有运行真实模型、Cloud Dream 或质量 benchmark。可以指出同步、编译、回执和上下文统计的实现入口，不能据此提供记忆准确率、跨设备同步成功率或效果排名。

特别是 `/dream` 返回 Dreaming，只确认请求进入排队；memory_updated 只表示某个通知路径已触发。最终任务是否使用了正确的新事实，仍需保留当时的记忆版本与实际模型输入来验证。

## 用同一个项目变更样本观察五层

先把“采用 Python”改成 Rust，再开启新任务。第一层读取文件，确认没有只改到错误 agent 的目录；第二层记录 git status、HEAD 和远端 push 状态；第三层检查 root core 与 deferred 目录投影；第四层保留具体模型请求或工具输出；第五层观察模型是否正确解释当前状态与历史决定。

如果本地文件已改而 HEAD 未变，local core 编译可能仍来自旧提交；如果 deferred 内容已经由 Memory 返回，模型却没采用，要继续看它是否适用于当前任务。若另一设备仍读旧版本，则应查同步，不应首先更改反思 prompt。

## 测试代码究竟覆盖什么

`app-server-dream.test.ts` 通过真实 AppServer 入口配合本地 HTTP fixture，检查 WebSocket 命令如何变成带作用域的 SDK POST，以及 queued、no_work、busy、404 等回执如何映射。测试显式不发送模型或消息请求，所以它证明传输与回执处理，不证明服务端完成了一次反思。

MemFS 同步测试、本地 transcript 测试又覆盖各自的 Git/文件与格式边界。读过测试不等于本轮运行通过；测试名中的 integration 也不自动意味着使用了真实 Cloud 或真实模型。验证记录应写出 fixture、临时目录、网络替换和运行时，尤其 Bun 源码入口与发布 Node bundle 的差异。

Cloud 的记忆服务、反思执行队列与数据存储内部不在此仓库。对这些部分只能区分请求代码、官方契约和黑盒实测，不补写看似合理的服务端实现。

## 上下文统计是估计还是报告值

`letta memory tokens` 调用 `estimateSystemPromptSize`，按 UTF-8 字节数约四字节一个 token 估算 core 文件。它有助于发现过大的 root 记忆，不是模型精确 tokenizer，也不包含所有工具定义、消息历史、deferred 工具返回和回答输出。

网页上下文展示还会使用 runtime snapshot 的 usedTokens，并按既有分类权重重新缩放 breakdown。总使用量与 core/external 等分类因此可能来自不同口径。不能把图上的每个分区都解释为提供商逐项计量，也不能当成账单金额。

## 遥测提供诊断，也有边界

当前 telemetry 默认开启，`LETTA_CODE_TELEM=0` 或 `false`，以及 `DO_NOT_TRACK=1` 可禁用。事件包含会话、工具、错误、反思开始/结束及 worktree 清理等，session 统计可带 usage；错误字段还可能包含 stderr、诊断摘要或 debug tail。不能简单声称只上传匿名计数。

flush 合并同时进行的发送，按 acting user 分组，永久拒绝会丢弃，暂时失败重新入队；队列有上限，退出 drain 也有时限。这是一套尽力诊断通道，不是完整审计或 exactly-once 事件账本。本轮仅静态阅读，未初始化遥测或发送研究数据。

## 下一轮怎样做效果实验

用合成用户与独立临时配置，固定 agent、provider、模型、记忆提交、MemFS 格式和触发条件。分别比较无记忆、只 root core、按需读取 deferred 的相同任务，记录工具轮数、输入输出、失败边界与最终回答；若涉及 Cloud Dream，排队和完成需另设观察条件。

这些是实验设计，不是本轮已经跑过的结果。三项目对比也应同时说明 Letta 是完整 Agent 宿主，而 Mem0 可以是提取/检索库，避免把不同宿主的行为误归到记忆模块。

## 源码定位

- [Dream 传输 fixture 测试](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/app-server-dream.test.ts) · [排队回执解析](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/reflection-runs.ts)。
- [本地记忆上下文编译](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)。
- [token 粗估](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/system-prompt-size.ts) · [网页 usage 分区缩放](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/web/context-usage.ts)。
- [遥测事件、开关、发送与 drain](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/telemetry/index.ts)。

## 自测

1. 为什么真实 AppServer 加 fixture 的 Dream 测试，仍不是反思效果实验？
2. root 文件 token 估算、运行时上下文总量和供应商账单各能回答什么？
