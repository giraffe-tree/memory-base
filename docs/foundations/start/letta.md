---
id: foundations.start.letta
title: 现在的 Letta 在哪里，记忆怎样进入 Agent？
summary: 以当前letta-code为基线，区分API与本地实现、MemFS工作树与已提交core，以及渐进读取与消息检索。
project: letta
minutes: 6
status: source_verified
prerequisites:
- foundations.start.memory
- foundations.start.context
sources:
- README.md
- src/backend/backend-mode.ts
- src/agent/memory-format.ts
- src/backend/local/system-prompt-compilation.ts
- src/tools/impl/memory.ts
- src/backend/message-search.ts
---

## 研究当前实现，而不是旧名字

官方原仓库 [letta-ai/letta的固定入口快照](https://github.com/letta-ai/letta/tree/8816d3a8516893bfdc0fa14bfb1235226012e295) 明确把当前实现指向letta-code，旧V1源码留在archive。这里研究当前letta-code的 `e6d6cc27ef11`，不使用旧Python服务器或历史MemGPT印象补写缺失实现。

Letta Code是持久Agent harness，记忆与模型循环、工具执行和会话生命周期一起工作。[resolveBackendMode](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend-mode.ts) 在没有显式覆盖时根据local实验开关选择local，否则使用api。读取API调用代码只能证明请求契约，不能证明Cloud服务端全部内部行为。

## 先认识MemFS的两层

当前MemFS v2用根MEMORY.md标识布局；顶层Markdown作为core，子目录内容可以延后读取。[isCoreMemoryPath / isProjectedMemoryPath](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) 根据路径和祖先索引判断分类，并排除skills投影。

例如根project.md可以保存“alpha当前使用Rust”，projects/alpha/下可以保存迁移过程与细节。这里是公开合成例子，并不是本轮已运行的Agent结果。

## 文件写了，模型就看到了吗

在本地实现，[collectCommittedMemoryFiles / compileLocalSystemPrompt](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) 用git ls-tree与git show HEAD读取已提交版本。工作树更改、Git commit、prompt重新编译与下一次模型调用分别是不同事件。不能仅看到文件已保存，就宣布它已经进入系统提示。

[Memory工具](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) 则从当前活动记忆目录按路径渐进发现子层：目录返回索引和直接子项，文件返回内容，并有输出截断。它不是Mem0那种根据一句问题执行语义事实搜索的同名接口。工具读工作树与prompt读已提交版本也可能看到不同内容。

## 历史找回是另一条路

[searchMessagesForBackend](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts) 按backend能力分流：本地读取自己的transcript搜索实现，API模式发送远程搜索请求。本地实现明确不支持vector/hybrid消息搜索；远程请求支持字段不代表其服务端排名算法已在本仓库核验。

接下来读 [Letta系统边界](../../projects/letta/01-overview.md)，再读 [三方架构比较](../../comparisons/three-way-architecture.md)。每一页都会说明它描述的是本地实现、客户端边界还是尚未运行的行为。


## 源码定位

- [letta · README.md](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/README.md)
- [letta · src/backend/backend-mode.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend-mode.ts)
- [letta · src/agent/memory-format.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts)
- [letta · src/backend/local/system-prompt-compilation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)
- [letta · src/tools/impl/memory.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts)
- [letta · src/backend/message-search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts)

## 自测

1. 为什么Letta的工作树文件、已提交core与模型输入可能暂时不同？
2. 为什么Memory路径读取、历史消息搜索和Cloud搜索请求不能被视为同一个机制？
