---
id: comparisons.three-way-architecture
title: 三套记忆系统，状态与模型供给究竟归谁？
summary: 以逐项源码证据比较ReMe、Mem0和当前Letta，不把归档或远程API的未知实现补成事实。
project: comparison
projects:
- reme
- mem0
- letta
minutes: 12
status: source_verified
prerequisites:
- projects.reme.overview
- projects.mem0.overview
- projects.letta.overview
sources:
- project: reme
  path: reme/application.py
- project: reme
  path: reme/components/file_store/local_file_store.py
- project: reme
  path: reme/steps/index/search.py
- project: reme
  path: reme/steps/evolve/dream/integrate.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/memory/storage.py
- project: mem0
  path: mem0/utils/scoring.py
- project: letta
  path: src/backend/backend-mode.ts
- project: letta
  path: src/backend/local/local-store.ts
- project: letta
  path: src/backend/local/system-prompt-compilation.ts
- project: letta
  path: src/agent/reflection-runs.ts
- project: letta
  path: src/backend/message-search.ts
- project: mem0
  path: mem0/client/main.py
- project: letta
  path: src/agent/memory-git.ts
- project: reme
  path: reme/steps/evolve/auto_memory.py
- project: letta
  path: src/tools/impl/memory.ts
---

## 比较范围与结论

ReMe围绕经历文件与整理链，Mem0 OSS围绕事实项与store，当前Letta围绕持久Agent及其记忆／上下文生命周期。这个判断来自下表的实际入口、持久化和供给路径，不能据此给出质量或速度排名。

基线分别是ReMe `d323356e6f11`、Mem0 `ed1f10fc8708`、Letta Code `e6d6cc27ef11`。Letta原仓库已迁出当前实现，本文不研究archive。对Letta远程Cloud部分只描述可见客户端契约；表中本地实现不自动等于Cloud内部实现。

## 逐项证据矩阵

| 切面 | ReMe | Mem0 OSS | Letta当前代码 |
| --- | --- | --- | --- |
| 研究表面 | Application装配组件与Jobs，宿主决定何时提交／供给。 [Application.run_job](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py) | Memory在调用进程执行OSS逻辑，MemoryClient另走HTTP。 [MemoryClient.add](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py) [Memory](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 当前letta-code是harness；默认api分流，local由显式覆盖／实验开关选择。 [resolveBackendMode](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend-mode.ts) |
| 内容载体 | 工作区正文为内容，FileStore维护分块与索引。 [LocalFileStore](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py) | 主vector payload保存data；SQLite保存历史与最近消息。 [_add_to_vector_store](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) [SQLiteManager](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py) | 本地LocalStore保存Agent／会话／消息文件；MemFS有独立Git版本。 [initializeLocalMemoryRepo](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) [LocalStore](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts) |
| 模型供给 | Search返回片段，宿主必须消费工具结果。 [SearchStep.execute](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py) | search返回事实项与可选解释，宿主自行加入上下文。 [Memory.search](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 本地已提交core编译入system，deferred按需读。 [compileLocalSystemPrompt](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| 更正方式 | AutoMemory更新daily，Dream整合长期知识。 [AutoMemoryStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py) [DreamIntegrateStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py) | 自动ADD-only与显式update/delete分开。 [_add_to_vector_store / update](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 文件编辑与commit后投影，客户端reflection和Cloud排队需分开。 [collectCommittedMemoryFiles](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) [requestCloudReflectionRun](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts) |
| 检索含义 | 默认BM25，配置双路时按条件RRF。 [_rrf_merge](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py) | 语义候选前置门控，再按BM25／entity加分。 [score_and_rank](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py) | Memory按路径读；本地消息FTS另路，远程算法不可由请求字段推断。 [Memory路径读取](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) [searchMessagesForBackend](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts) |


每个单元格的链接都固定到对应commit，并给出支持该判断的符号。表格没有采用营销功能清单，也没有从目录名称推导运行时保证。部分字段的生产配置可以覆盖默认值；相同名称不意味着相同协议或状态模型。

## 用共同任务对齐验收

公开合成目标是：“周一选Python，周二改为Rust；今天任务采用Rust，同时能解释旧决定。”ReMe要检查来源、daily、digest、索引和模型供给；Mem0要检查新旧事实、scope、显式ID更正和返回结果；Letta要检查工作树、commit、core投影、deferred读取和最终请求。

这几个观察点来自各自代码持有的状态，不强行要求三者运行同一个add API。仅看最终回答无法确认中间机制；仅数持久化记录也无法确认它们实际进入模型。

## 不能从源码矩阵推导什么

本轮没有在同模型、同预算、同语料下运行三套系统；不能宣称谁更准确、更省token或具备更强的长期理解。Letta本地检索与Cloud检索分别有证据范围，Cloud请求接受某参数也不证明服务端具体实现。

基于这些机制的采用条件推断是：人工编辑正文及重建索引的要求要检查ReMe的文件链路；事实API与scope过滤要求要检查Mem0；希望记忆参与Agent自身prompt与工作流的要求要检查Letta。它们对应不同工程目标，采用前仍需运行同一故事验证失败恢复与实际供给。

继续读 [写入与可见性](three-way-write-path.md)、[更正与遗忘](three-way-fact-updates.md)、[检索与供给](three-way-retrieval-context.md)。


## 源码定位

- [reme · reme/application.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)
- [reme · reme/components/file_store/local_file_store.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py)
- [reme · reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)
- [reme · reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)
- [mem0 · mem0/utils/scoring.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)
- [letta · src/backend/backend-mode.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/backend-mode.ts)
- [letta · src/backend/local/local-store.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts)
- [letta · src/backend/local/system-prompt-compilation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)
- [letta · src/agent/reflection-runs.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts)
- [letta · src/backend/message-search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts)

- [mem0 · mem0/client/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py)

- [letta · src/agent/memory-git.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts)

- [reme · reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)

- [letta · src/tools/impl/memory.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts)

## 自测

1. 同一句“项目改用Rust”，三者分别有哪些内容与派生状态？
2. 为什么Letta本地实现可读，仍不能宣布Cloud内部检索算法已核验？
