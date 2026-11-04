---
id: projects.letta.storage-index
title: MemFS、Git、transcript 和编译快照分别保存什么？
summary: 以本地后端的可见文件路径为基线，区分知识内容、经历记录、当前上下文和可重建投影。
project: letta
minutes: 10
status: source_verified
prerequisites: [projects.letta.memory-model]
sources:
  - src/utils/local-backend-paths.ts
  - src/agent/memory-filesystem.ts
  - src/backend/local/paths.ts
  - src/backend/local/local-store.ts
  - src/backend/local/local-transcript.ts
  - src/backend/local/system-prompt-compilation.ts
  - src/backend/local/transcript-search.ts
  - src/agent/memory-git.ts
---

## 结论：本地状态分布在多组文件中

当前 LocalBackend 将 Agent 记录、conversation 元数据、消息 transcript、提示编译快照和 MemFS Git 仓库分开保存。MemFS 是知识内容，不是一个可随意删除的检索缓存；transcript 是经历材料，编译快照是特定会话使用的提示状态。

本页核验 `e6d6cc27ef1111da80e919dc1cef179613894b66`，日期 2026-11-04。只对本地存储与客户端 checkout 作源码判断，未验证所有 Cloud 服务端持久化与恢复路径。

## 默认路径怎样解析

[local-backend-paths.ts 的 `getLocalBackendStorageDir`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/utils/local-backend-paths.ts) 默认选择产品配置目录下 `lc-local-backend`，普通配置可对应 `~/.letta/lc-local-backend`，`LETTA_LOCAL_BACKEND_DIR` 可覆盖。local 的 MemFS 位于其下 `memfs/<agentId>/memory`。

API 模式下的 Agent checkout 则由[memory-filesystem.ts 的 `getMemoryFilesystemRoot`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-filesystem.ts) 解析到产品配置目录的 `agents/<agentId>/memory`。两个目录不能凭同一个 agent 名称就当成同一份状态；切换 backend 时需要核对实际作用域。

| 状态 | 本地主要载体 | 恢复时应回答的问题 |
| --- | --- | --- |
| 身份、原始 system、模型设置 | `agents/<id>.json` | 这个 Agent 的身份和运行配置是什么？ |
| 会话元数据 | conversation 目录的 `conversation.json` | 归属谁，哪些消息仍在当前上下文？ |
| 经历 | `messages.jsonl` 与 `manifest.json` | 消息和压缩记录是否完整，格式是否匹配？ |
| 提示投影 | `system-prompt.json` | 对应哪个 raw system hash 和 MemFS revision？ |
| 核心与延后知识 | 独立 MemFS 工作树和 `.git` | 当前文件、已提交版本与远端版本是否一致？ |

这些保存操作在[LocalStore 的 `persistAgent`、`persistConversationState`、`persistCompiledSystemPrompt`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts) 中分开执行，不能解释成一个跨所有文件的原子数据库提交。

## transcript 不只是 UI 显示列表

[local-transcript.ts 的 `LOCAL_TRANSCRIPT_MESSAGE_FORMAT`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-transcript.ts) 标记当前 JSONL 格式，manifest 帮助解释数据行；记录还包括压缩边界。UI 可将底层消息投影为工具请求、工具返回等显示项，不能把两种 ID 与行结构任意互换。

LocalStore 有 resident tail 与按需读取逻辑，减少常驻内存。默认 resident tail 100 是内存窗口的保留策略，不是“磁盘仅存一百条”。恢复和搜索应检查 transcript，而不是只统计当前 resident 数量。

## 索引在这里意味着什么

MemFS 的 `MEMORY.md` 是供模型和工具理解的目录索引，不是 BM25 倒排表。local prompt 编译通过 Git 枚举已提交 Markdown，再生成 core 与 deferred 入口；没有必要把每个记忆文件都先写进向量数据库才能被使用。

local recall 搜索则由[transcript-search.ts 的 `searchLocalTranscriptMessages`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/transcript-search.ts) 扫描消息 JSONL，投影并计算词项统计。该路径不等于 MemFS 全文搜索，更不能从它推导远程服务使用同一个索引架构。

## 备份与重建不能只保留一种文件

如果只备份 transcript，Agent 自己整理出的偏好和方法可能只在 MemFS 中；只备份 MemFS，又不能恢复完整会话经历。若工作树有未提交更改，Git HEAD 还不是最新可见文件的全部备份。反过来，删除 `system-prompt.json` 与删除 MemFS 正文的影响也不相同。

[memory-git.ts 的 `initializeLocalMemoryRepo` 与 `syncPendingMemoryCommitsAfterTurn`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) 分别负责建仓和同步状态判断。Git 历史提供版本材料，不自动保证多个状态目录具有同一时刻的一致快照。本轮未执行损坏恢复实验，因此不把“有 Git”写成端到端恢复保证。

例如把本机 checkout 复制到另一台机器，只能先证明那些文件已经复制；还需确认 Agent 身份记录、会话归属、模型配置和实际记忆路径都指向预期位置。一个界面能够显示旧聊天，也不说明它加载了相同版本的核心知识。反过来，当前提示能读到核心约束，也不能证明全部历史消息都可搜索。恢复验收要同时观察这两条读取链，避免只靠一次成功回答判断备份完整。

## 源码定位

- `src/backend/local/local-store.ts`：保存 Agent、conversation、transcript 与编译快照的文件职责。
- `src/backend/local/system-prompt-compilation.ts`：`getCommittedMemfsRevision`、`collectCommittedMemoryFiles`，已提交内容与投影关系。
- `src/backend/local/paths.ts`：`getLocalBackendMemoryFilesystemRoot`，本地 Agent 记忆目录。

## 自测

1. resident tail 只有一百条，为什么不能据此判断旧消息已从磁盘删除？
2. 只备份 messages.jsonl 或只备份 MemFS，分别可能缺少什么？
