---
id: projects.letta.runtime-consistency
title: 会话运行、记忆同步和本地恢复分别由谁负责？
summary: listener 用 turn lease 管执行所有权，MemFS 用局部文件锁与 Git 协调，本地会话用 JSON/JSONL 持久化，三者不是统一事务。
project: letta
minutes: 10
status: source_verified
prerequisites: [projects.letta.overview, projects.letta.storage-index]
sources: [src/websocket/listener/turn-lifecycle.ts, src/websocket/listener/queue.ts, src/runtime-context.ts, src/agent/memory-operation.ts, src/websocket/listener/memfs-sync.ts, src/backend/local/local-store.ts, src/backend/local/local-store-corrupt-agent.test.ts, src/backend/local/local-transcript.test.ts, src/cli/helpers/post-turn-reflection.ts, src/cli/helpers/reflection-completion.ts]
---

## 结论：会话、文件和远端状态各有所有者

固定 `e6d6cc27ef11` 的 Letta Code 同时包含终端、headless、listener 和实验性的 local backend。不能因为它们共用部分模块，就把任一入口的状态机保证推广到全部执行方式。

listener 用 TurnLifecycle 管本地活动回合，MemFS 有独立文件与 Git 锁，local backend 再保存 agent、conversation 和 transcript。各层有恢复措施，但没有一个覆盖消息、记忆提交、远端 push 与模型响应的总事务。

## listener 的执行所有权

`TurnLifecycle` 定义 idle、command、active、cancelling。活动回合有独立 TurnLease 和 AbortSignal，异步操作应确认仍持有当前 lease 才修改状态或发事件。取消后进入 cancelling，队列仍等待结算，避免旧异步结果与下一回合互相覆盖。

这是控制本地会话副作用的机制，不是撤销所有已执行工具。已经写入文件或发送远端请求后，取消信号不能自动回滚结果。审批暂停也属于当前回合的延续边界，不能当作业务完成。

`RuntimeContextSnapshot` 通过 AsyncLocalStorage 传递 agent、conversation、acting user、工作目录与权限等信息，解决同进程异步调用的上下文归属。它并非持久数据库，也不独立证明云端对 actor 的授权。

## MemFS 锁覆盖了哪些写者

`claimMemoryOperation` 在 Git 目录中建立文件锁，用 pid 与进程起始时间判断锁拥有者，只有死进程的锁可回收；等待者可被取消。harness 的 memory worker、冲突修复、反思整合与回合后同步在相应调用点协调。

源码明确说明主 Agent 自身的文件编辑不经过这把锁。反思使用独立 worktree，worker 只 stage 自己修改的文件，冲突交给 Git 和整合策略处理。这里的跨进程协调范围比一个普通内存 mutex 大，但仍不能声称所有写入天然串行或没有冲突。

listener 的首次 MemFS 同步按 agent 缓存一个进行中的 promise，并发调用共享它；失败删除缓存，下一轮可以重试。它减少重复 clone/pull，不是实时订阅所有远端变更，也不是持久化重试队列。

## local backend 没有这里假想的 SQL 数据库

`LocalStore` 以 agent JSON、conversation JSON、转录 JSONL 和相关 manifest/编译缓存持久化；另有独立 Git 记忆目录。写会话状态时依次写元数据、转录和编译上下文，不能把这些文件写入视作一笔 SQL commit。

磁盘会话可只驻留有界尾窗口，历史读取再访问转录。追加前会校验未解析的转录头，遇到损坏拒绝继续写，避免在未知损坏上叠加数据。损坏 agent JSON 的上游测试则核验跳过并隔离为 `.corrupt`，其他有效 agent 仍能加载。

这些是具体格式与路径的恢复策略，不证明任意宕机点都无损。需要完整恢复时还要保留转录、manifest、会话记录、记忆 Git 树及对应版本；模型 API 的服务端运行状态不由这些本地文件直接重建。

## 反思进度与同步也分步提交

客户端 `maybeLaunchPostTurnReflection` 在回合结束且转录增量已记录后判断触发条件。默认设置以 compaction-event 为触发，可配置 step-count 或 off；不是固定每天执行一次。worktree 整合完成后，`finalizeAutoReflectionCompletion` 才更新相应 payload 进度，成功时再尝试同步 Cloud 配置和反思水位。

云同步失败会记告警，不能回溯性地让已发生的本地整理消失。Cloud cutover 下的 Dream 排队、执行与恢复又是服务端职责，本仓库不包含其全部实现。验收时应分别记录本地进度、提交号、push 状态与云回执。

## 源码定位

- [活动回合与 lease](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/listener/turn-lifecycle.ts)：`TurnLifecycle`。
- [异步调用作用域](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/runtime-context.ts)：`runWithRuntimeContext`。
- [记忆操作文件锁](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-operation.ts) · [首次同步合并](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/listener/memfs-sync.ts)。
- [本地文件持久化](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts) · [损坏记录测试](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store-corrupt-agent.test.ts)。
- [反思完成与云进度](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/helpers/reflection-completion.ts)。

本页仅核验源码和测试定义，未运行多进程、进程崩溃或真实 Cloud 恢复实验。

## 自测

1. TurnLease、记忆文件锁和 Git worktree 分别防止哪类竞争？
2. 为什么转录恢复测试通过，仍不足以证明端到端回合 exactly-once？
