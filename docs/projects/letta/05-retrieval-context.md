---
id: projects.letta.retrieval-context
title: 已在上下文的核心、按路径展开的知识与 recall 怎样协作？
summary: 区分 core 投影、Memory 工具和消息搜索；本地 recall 是 BM25，远程搜索只有协议与调用端证据。
project: letta
minutes: 11
status: source_verified
prerequisites: [projects.letta.storage-index]
sources:
  - src/backend/local/system-prompt-compilation.ts
  - src/tools/impl/memory.ts
  - src/backend/message-search.ts
  - src/backend/local/transcript-search.ts
  - src/backend/conversation-search.ts
  - src/backend/api/search.ts
  - src/tools/memory-tool.test.ts
  - src/backend/message-search.test.ts
---

## 结论：这里有三条读取路径

core 在提示编译时进入系统输入；deferred 知识通过 Memory 工具按路径渐进读取；recall 从过往消息中找经历。三者不是一个名为 search 的接口，也不都依赖语义向量召回。

本页基于 2026-11-04 固定版本 `e6d6cc27ef1111da80e919dc1cef179613894b66` 的源码核验。没有运行实际模型、Cloud 检索或中文效果评测；上游测试阅读与本轮实验结果分别记录。

## 先看模型已经收到什么

假设 core 的 project.md 记录“alpha 当前用 PostgreSQL”，projects/alpha.md 保留迁移细节。local 的[compileLocalSystemPrompt](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) 从已提交文件生成 core，默认不会把所有 deferred 正文都注入。模型可以先知道当前约束，再沿目录入口读取细节。

这使写入位置影响后续输入成本：把大量历史放在 core 会扩大常驻材料，移入 deferred 则要求后续正确发现和调用。布局本身不能保证模型一定选中需要的目录。

## Memory 工具怎样展开知识

[memory.ts 的 `memory`、`renderDirectory`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) 仅在活动 MemFS v2 可用。`Memory("projects")` 返回目录 `MEMORY.md` 与直接子文件、子目录信息；`Memory("projects/alpha.md")` 返回具体文件。它拒绝根和顶层 core 文件，因为这些内容应已在上下文，并把 skills 引导到 Skill 工具。

返回内容有行数、单行长度、字符和目录项数限制。截断时会提示继续 Read 分段读取；目录排序结合最近 Git 提交时间与未提交文件 mtime。它是当前文件树的读取，不是语义相关性排名，也不能把“目录列出十个文件”当成模型已读取十份正文。

工具会校验相对路径与解析后的真实路径，拒绝逃出 memory root。该校验是这个读取面的边界，不直接等于整个多用户服务的身份授权。工作树读取还可能与 core 已提交快照处在不同版本。

## 本地 recall 从哪里查

[message-search.ts 的 `searchMessagesForBackend`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts) 按 backend 能力路由。本地调用 `searchLocalTranscriptMessages`，远程调用 API。不能因为远程请求允许 `vector`、`fts`、`hybrid` 字段，就断言 local 实现三种模式都可用。

事实上，[transcript-search.ts 的 `searchLocalTranscriptMessages`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/transcript-search.ts) 明确拒绝 vector／hybrid，采用本地全文路径。它扫描 conversation 下的 messages.jsonl，按 Agent、conversation、日期和 hidden 条件选择材料，再计算 BM25 风格分数，词项参数为 k1=1.2、b=0.75。

双引号短语成为严格过滤并获得额外分数；CJK 连续文本使用子串词频，拉丁词保持 token 匹配。无明确 conversation 目标时，当前最新问题及消息搜索工具的回声会降权，避免刚问过的问题压过真正旧经历。这些程序机制不等于已经验证中文检索质量。

## 会话搜索与消息搜索也不同

[conversation-search.ts 的 `localSearchConversations`](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/conversation-search.ts) 先取有限的近期会话，再用 query terms 匹配 summary，以命中词比例排序。返回字段虽叫 `rrf_score`，该本地分支并没有执行多路 Reciprocal Rank Fusion。summary 未包含某事实时，不能由会话搜索无命中推断 transcript 不存在它。

远程[api/search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/search.ts) 仅展示 `/v1/messages/search` 和 `/v1/conversations/search` 的请求路径。本轮可以核验参数路由，不能核验 Cloud 的内部向量库、融合算法或完整索引更新保证。

## 返回之后仍要检查使用链

Memory 工具结果与 recall 命中都是下一次推理的材料，不是事实正确性证明。旧经历里的 SQLite 决定可能已被更新 core 取代；Agent 必须理解日期、角色、语境和当前状态。验收应保留 core revision、读取路径、搜索条件、返回片段与最终实际模型输入，分别判断发现、供给和作答是否成功。

## 源码定位

- `src/tools/impl/memory.ts`：`resolveMemoryToolDirectory`、`memory`，渐进读取与输出限制。
- `src/backend/local/transcript-search.ts`：`parseQuery`、`rankMatches`，本地词项、短语与回声降权。
- [Memory 工具测试](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/memory-tool.test.ts)与[消息搜索路由测试](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.test.ts)：本页未运行。

## 自测

1. core、Memory("projects") 与 recall search 各在读取什么材料，哪些已在模型上下文里？
2. 本地会话结果字段叫 rrf_score，为什么仍不能说它实现了与 ReMe 相同的 RRF？
