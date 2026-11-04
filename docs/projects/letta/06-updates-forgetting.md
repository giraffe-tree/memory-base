---
id: projects.letta.updates-forgetting
title: 修改记忆后，工作树、提交、云端和模型何时改变？
summary: 当前 Letta Code 通过 MemFS 文件与 Git 维护知识，提交、同步和上下文重编译是不同事件，删除也不等于抹除历史。
project: letta
minutes: 10
status: source_verified
prerequisites: [projects.letta.write-path, projects.letta.storage-index]
sources: [src/websocket/listener/commands/memory.ts, src/agent/memory-git.ts, src/backend/local/local-backend.ts, src/backend/local/system-prompt-compilation.ts, src/tools/impl/memory.ts, src/agent/memory-worktree.ts, src/agent/reflection-runs.ts, src/backend/api/reflection-runs.ts, src/cli/helpers/reflection-launcher.ts, src/cli/app/use-submit-handler.ts, src/backend/local/local-store.ts]
---

## 结论：变更有几个不同的完成点

本页研究 `letta-code` 的 `e6d6cc27ef11`，不套用旧 MemGPT 服务的记忆工具模型。当前 MemFS 知识可以被文件工具或管理命令编辑，Git 保存版本；Cloud 模式还存在远端同步。本地文件变了、提交成功、push 完成、下一次模型读到新内容，是不同事件。

例如把“项目采用 Python”改为 Rust，需要确认改的是当前使用的记忆目录，并检查提交与上下文。仅在界面看到新正文，不能证明另一个设备或当前会话已经使用了它。

## 一次界面写入怎样推进

listener 的 `write_memory_file` 分支校验路径位于 agent 的记忆根目录，确保 checkout，解码字节并写文件，然后调用 `commitMemoryWrite`，只传入本次目标 pathspec。提交受当前记忆格式与约束检查影响，写文件本身并不等于提交必然成功。

云端模式接着调用 `awaitMemoryPushBounded`，优先等待 push 后再通知调用方；等待上限是八秒，超过后仍可响应，push 在后台继续，失败记录告警。这里没有把“本地提交成功”转换成无条件的远端持久化保证。localMemfs 且无 remoteMemfs 时，不要求向 Letta Cloud 推送。

普通 Agent 文件编辑还有回合结束同步：`syncPendingMemoryCommitsAfterTurn` 检查冲突、未提交修改和待推提交。工作树脏时返回 dirty，不自动替所有修改创建提交；远端拒绝非快进 push 时尝试 pull --rebase，仍可能返回 conflict 或 push_failed。

## 下一轮模型看到哪个版本

本地 `collectCommittedMemoryFiles` 通过 `git ls-tree HEAD` 与 `git show HEAD:path` 编译记忆，取的是已提交版本。`LocalBackend.getOrCompileSystemPrompt` 比较原始 system hash 与 MemFS revision，修订变化时生成新的记忆投影；已有对话可得到 `<memory_update>`，要求之后使用新投影。

因此未提交的 Rust 文件可能尚未进入本地 core memory 编译。另一方面，Memory 工具直接读取活动工作目录中的 deferred 文件，不能把所有读取路径都等同于 HEAD 快照。检查“模型看见什么”时，应同时保留当时的提交号与具体输入。

Cloud 的记忆编译与远端持久化服务不在本仓库中；客户端发出了同步或 recompile 请求，不足以证明其服务端事务与完成时机。

## Dream 与客户端 reflection 分开理解

`/dream`、`/reflect`、`/reflection` 先经 `requestCloudReflectionRun` 判断所有权：localMemfs、Cloud 配置明确未 cutover，或预检返回 404，会返回 null，授权 TUI/listener 继续现有 Code-managed 路径；其他预检错误不会静默当作本地回退。只有 Cloud cutover 分支调用 `postReflectionRun` 请求服务端排队，接受 queued 或 no_work 回执。“Dreaming...”表示排队已确认，不表示知识整合完成。这个 Cloud admission 接口不支持 local/custom，不能把它扩大成所有同名 UI 命令都不支持本地反思。

仓库仍有客户端 reflection 路径：在独立 Git worktree 中整理，再依据结果合入父仓库。父工作树脏、子任务未成功或合并冲突会产生不同状态；成功合并与无变更才允许相应转录进度继续推进。Cloud `cutover=true` 时客户端 launcher 跳过本地反思，避免把两套路径混成一个统一后台任务。

## 删除保留哪些痕迹

`delete_memory_file` 先 unlink，再提交删除，随后尝试同步。普通 Git 删除保留旧提交中的内容，其他笔记、对话和模型上下文也没有因此自动撤销。撤回一个决定与擦除所有历史，必须分别设计验收。

本地 `LocalStore.deleteAgent` 删除 agent JSON 和属于它的会话目录，但该函数没有同时删除独立 `memfs/<agent>/memory` 树。因此删除 Agent 对象不能直接解释为所有本地记忆与 Git 历史都清空。Cloud 的删除传播也不能由 SDK 调用代码推断。

## 源码定位

- [文件写入、删除与八秒 push 等待](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/websocket/listener/commands/memory.ts)：`awaitMemoryPushBounded`、写入和删除命令分支。
- [提交与回合后同步](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts)：`commitMemoryWrite`、`syncPendingMemoryCommitsAfterTurn`。
- [本地 HEAD 编译](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) · [修订变化与上下文更新](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-backend.ts)。
- [反思工作树整合](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-worktree.ts) · [Cloud Dream 回执](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/reflection-runs.ts)。
- [Cloud 与 Code-managed 所有权路由](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts) · [TUI 手动入口](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/app/use-submit-handler.ts)。
- [本地 Agent 删除范围](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts)：`deleteAgent`。

本页为源码核验，未连接 Cloud、执行模型反思或测量跨设备传播。

## 自测

1. 为什么写入成功、Git commit、push 和模型使用新记忆要分别检查？
2. 删除一个记忆文件或 Agent 对象后，哪些位置仍可能保留旧内容？
