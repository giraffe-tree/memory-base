---
id: projects.letta.memory-model
title: core、deferred、transcript 与 memory blocks 是同一种数据吗？
summary: 沿 MemFS v2 的根布局和本地提示投影，区分文件版本、Agent 身份、会话与当前可见上下文。
project: letta
minutes: 10
status: source_verified
prerequisites: [projects.letta.overview]
sources:
  - src/agent/memory-format.ts
  - src/agent/memory-filesystem.ts
  - src/agent/create-agent-request.ts
  - src/backend/local/initial-memory.ts
  - src/backend/local/system-prompt-compilation.ts
  - src/backend/local/local-types.ts
  - src/backend/local/local-transcript.ts
  - src/memory-frontmatter.ts
---

## 结论：文件布局决定投影方式

当前 Letta Code 的 MemFS v2 以根 `MEMORY.md` 为标记。顶层 Markdown 被识别为 core，子目录内容用于按需展开；skills 有自己的加载入口。会话 transcript 另外保存经历，不是把整个 transcript 都写进 core 文件。

本篇核验于 2026-11-04，固定 `e6d6cc27ef1111da80e919dc1cef179613894b66`。具体提示投影以本地实现为证据，未将其推导成 Cloud 服务端完全相同的内部结构。

## 一棵最小记忆树

以下是合成例子，展示布局含义，不是本轮运行生成的 Agent：

```text
memory/
├── MEMORY.md                # 根索引
├── persona.md               # 身份与行为核心
├── project.md               # 当前最重要的项目约束
├── projects/
│   ├── MEMORY.md            # 子目录入口
│   └── alpha.md             # 更详细的项目记录
└── skills/
    └── deploy/SKILL.md       # 技能入口，另行加载
```

[memory-format.ts 的 `detectMemoryFormat` 与 `isCoreMemoryPath`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) 定义上述判断：存在根 `MEMORY.md` 即按 v2；v2 顶层 `.md` 属于 core，旧 v1 则以 `system/` 路径为 core。保留兼容路径不代表新建 Agent 默认仍采用旧布局。

## memory blocks 如何进入文件

创建请求仍可使用带 label、value、description 的 block。`DEFAULT_ROOT_MEMORY_BLOCK` 用 label `MEMORY` 表达根布局请求；[initial-memory.ts 的 `initialMemoryFilesFromCreateBody`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/initial-memory.ts) 将本地初始 block 转成文件，默认补上 root marker。

普通 block 生成顶层 Markdown 和 name／description；根 marker 写成不带 frontmatter 的 `MEMORY.md`。因此当前 local 路径不是额外维护一份独立 block 数据库、再逐文件双向复制的旧模型。Cloud 创建请求保留 block 形状，是可见协议契约；服务端如何建仓不能仅凭这个 builder 当作已审阅实现。

[memory-frontmatter.ts 的 `validateMemoryFileFrontmatter`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-frontmatter.ts) 对 v2 索引禁止 frontmatter，普通文件要求 name、description，并拒绝额外键。这是特定记忆文件契约，不是任意 YAML 笔记都可不加转换直接提交。

## core 与 deferred 的内容归属

[system-prompt-compilation.ts 的 `collectCommittedMemoryFiles`、`renderRootMemoryProjection`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) 从 Git HEAD 读取 core 正文，将根索引和顶层文件组合成提示片段。对符合索引链的一级子目录，它只给出 deferred 入口，不把所有子文件正文塞进系统提示。

更深路径是否属于可投影树，还受每层目录 `MEMORY.md` 存在与否约束；`skills/` 不走普通记忆投影。信息存在磁盘，不意味着当前上下文已拥有它；路径进入目录树，也不意味着正文已加载。

## Agent 与 conversation 保存不同身份

[local-types.ts 的 `LocalAgentRecord`、`StoredConversation`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-types.ts) 将身份、系统提示、模型设置和会话的 in-context message IDs 分开。一个 Agent 可以有多段 conversation，共享其 MemFS，但拥有不同会话消息与编译快照。

transcript 使用带 manifest 的 JSONL 格式，包含消息与压缩事件；上下文内 ID 是当前活跃材料的选择，不等于全部经历已消失或全部发送给模型。[local-transcript.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-transcript.ts) 的格式常量和 compaction entry 是这层区别的直接证据。

## 用当前状态与历史检验理解

“alpha 先用 SQLite”可出现在历史消息，核心约束可放在 project.md，细节理由放在 projects/alpha.md。后来换 PostgreSQL，修改核心不代表删除旧经历；读取旧经历也不能把当时的临时决定当成当前状态。Git 版本和来源消息提供材料，正确语义仍需模型与宿主判断。

还要区分知识身份与文件身份。一个文件可以包含多条约束，同一约束也可能在核心摘要与详细材料中各出现一次；它们没有因此自动获得跨文件唯一事实编号。重命名文件会改变发现路径，编辑索引会改变模型寻找材料的入口，即使正文没有改变也可能影响体验。这里的目录组织是一种上下文设计，而不是关系数据库的规范化表结构。

判断“记忆过期”时同样不能只看最近提交时间。提交时间说明版本何时形成，消息时间说明经历何时被记录，正文仍需表达适用条件和当前决定。一次较新的格式整理提交，不应自动使旧事实变成新的业务结论。

## 源码定位

- `src/agent/create-agent-request.ts`：`DEFAULT_ROOT_MEMORY_BLOCK`，创建协议中的根布局请求。
- `src/agent/memory-filesystem.ts`：`getScopedMemoryFilesystemRoot`，按 backend／Agent 选择实际路径。
- `src/backend/local/system-prompt-compilation.ts`：`compileLocalSystemPrompt`，从已提交文件生成 core 输入。

## 自测

1. projects/alpha.md 已存在，为什么下一次模型请求仍可能只有 projects/ 的入口？
2. Agent 共用记忆与 conversation 拥有各自上下文，分别体现在哪些状态里？
