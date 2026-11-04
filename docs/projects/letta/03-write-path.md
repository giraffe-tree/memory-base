---
id: projects.letta.write-path
title: 修改记忆以后，怎样才会影响未来调用？
summary: 区分文件写入、Git 提交、远端同步和提示刷新；当前 memory worker 主要负责修复，不能冒充自动抽取服务。
project: letta
minutes: 11
status: source_verified
prerequisites: [projects.letta.memory-model]
sources:
  - src/tools/impl/write.ts
  - src/agent/memory-git.ts
  - src/agent/memory-git-hooks.ts
  - src/agent/memory-operation.ts
  - src/backend/local/local-backend.ts
  - src/backend/local/system-prompt-compilation.ts
  - src/agent/subagents/builtin/memory.md
  - src/agent/subagents/memory-worker.ts
  - src/backend/local-system-prompt-compilation.test.ts
---

## 结论：写文件只是第一步

当前 Letta Code 记忆主线使用普通文件工具与 Git。文件内容改变、内容被提交、提交同步远端、提示重新编译，是不同状态。它没有因为一次 Write 返回成功，就保证未来所有调用已经使用了新记忆。

本页静态核验固定 commit `e6d6cc27ef1111da80e919dc1cef179613894b66`，日期 2026-11-04；未执行模型写入、网络同步或跨进程故障实验。

## 沿一条约束修改追踪状态

假设用户把 alpha 数据库从 SQLite 改为 PostgreSQL，Agent 决定更新核心 project.md。模型先提出 Write／Edit，由工具执行真实文件操作。[write.ts 的 `write`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/write.ts) 本身只负责路径展开、目录建立、文本落盘和错误返回，不包含自动 Git commit 或远端 push。

```text
对话与任务 → Agent判断需要保留什么
  → Write/Edit修改工作树
  → Git校验与commit → 已提交记忆版本
  → local提示刷新，或remote同步与重编译
  → 下一次实际模型输入使用更新
```

合成例子中的“改数据库”是用户决定；模型写下它不代表数据库迁移已执行。记录、计划和操作成果仍要分别表达。

## 提交验证解决结构，不解决事实真假

[memory-git-hooks.ts 的 `buildPreCommitHookScript`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git-hooks.ts) 安装提交前校验，读取 Git 暂存内容并检查 frontmatter 和树约束。它能阻止不符合布局、预算或保护字段的提交，不能验证“alpha 已完成迁移”是不是事实。

[memory-git.ts 的 `commitMemoryWrite`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) 是显式提交 helper，local 模式准备本地仓库并提交指定路径，remote 模式还准备认证。不能把该 helper 的存在推导成所有普通 Write 调用都会自动执行它。

## turn 结束不会偷偷提交所有脏文件

`syncPendingMemoryCommitsAfterTurn` 先检查 Git 状态：冲突返回 conflict，未提交改动返回 dirty；它不会把全部脏文件自动 add／commit。local-only checkout 没有 Letta remote 时返回 skipped，远程能力可用时才检查领先提交并 push，非快进失败有 rebase 后再尝试路径。

这个状态机在[同一 memory-git.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) 中可直接核验。dirty、已提交但未推送、推送失败不能合称“已保存并同步”；用户需要看到各层实际结果。

## 哪个版本被模型看见

local 的 `compileLocalSystemPrompt` 使用 `git show HEAD:<path>` 读取已提交内容；普通文件工具仍能读工作树。因此 project.md 已改但未提交时，文件读取可见新值，core 编译仍保持旧值，这不是同一读取面的矛盾。

[LocalBackend.getOrCompileSystemPrompt](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-backend.ts) 比较 raw system hash 与 MemFS revision。版本变化时，它可生成后续调用使用的 memory update，而非立刻替换一个正在进行中的模型请求。远程重编译是另一条 API 路径，不能将 local 实现直接当作 Cloud 内部保证。

## memory worker 不是每轮自动记笔记

当前[builtin/memory.md](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/subagents/builtin/memory.md) 将 memory 子 Agent 定义为内部修复 Git 冲突和无效树，指示修复后提交而不自行 push。`runMemoryWorker` 在 checkout lease 下组织修复、同步和提示刷新。这不证明每次聊天都交给该 worker 提取长期事实。

[memory-operation.ts 的 `withMemoryOperation`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-operation.ts) 使用文件锁协调 harness 管理的同步、整合与修复，但主 Agent 自己的编辑没有全部进入该锁。不能据此宣称任意并发文件写入都具备串行事务。

Git 提交也不是请求去重协议。相同输入再次交给 Agent，可能产生不同编辑或新的提交；同一文件内容没有变化，也不证明这次任务的全部业务副作用没有重复。验收重试时应分别记录工具调用、工作树差异、提交版本和远端同步状态，不能把“有版本控制”直接写成“同一业务请求恰好执行一次”。

## 源码定位

- `src/backend/local/system-prompt-compilation.ts`：`collectCommittedMemoryFiles`，界定本地 core 的已提交读取面。
- `src/agent/subagents/memory-worker.ts`：`runMemoryWorker`、`settle`，修复和同步失败分开记录。
- [本地提示编译测试](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local-system-prompt-compilation.test.ts)：用于检查版本投影样本；本页仅阅读，未运行。

## 自测

1. Write 成功后，Memory 工具读到新值而 core 仍是旧值，可能处于什么状态？
2. turn 结束返回 dirty 与 push_failed，分别应处理哪个失败阶段？
