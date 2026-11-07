---
id: comparisons.ten-framework-architecture
title: 十个开源记忆框架：按状态与调用链选择设计
summary: 用固定源码比较十个工程候选，并加入 Anthropic 对照；说明版本、来源、模型职责、检索供给与采用条件，不构造性能排名。
project: comparison
projects: [hindsight, mem0, graphiti, letta, openviking, cognee, memos, everos, langmem, memobase, anthropic]
minutes: 22
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - project: hindsight
    path: hindsight-api-slim/hindsight_api/engine/memory_engine.py
  - project: hindsight
    path: hindsight-api-slim/hindsight_api/engine/memories/postgres.py
  - project: mem0
    path: mem0/memory/main.py
  - project: mem0
    path: mem0/utils/scoring.py
  - project: mem0
    path: mem0/memory/storage.py
  - project: graphiti
    path: graphiti_core/graphiti.py
  - project: graphiti
    path: graphiti_core/search/search_filters.py
  - project: letta
    path: src/agent/memory-format.ts
  - project: letta
    path: src/backend/local/system-prompt-compilation.ts
  - project: letta
    path: src/agent/memory-git.ts
  - project: openviking
    path: openviking/retrieve/hierarchical_retriever.py
  - project: openviking
    path: openviking/retrieve/context_assembler/pipeline.py
  - project: openviking
    path: openviking/session/session.py
  - project: cognee
    path: cognee/api/v1/remember/remember.py
  - project: cognee
    path: cognee/api/v1/recall/recall.py
  - project: cognee
    path: cognee/api/v1/forget/forget.py
  - project: memos
    path: src/memos/mem_os/core.py
  - project: memos
    path: src/memos/memories/textual/tree.py
  - project: everos
    path: src/everos/service/memory/_memorize.py
  - project: everos
    path: src/everos/service/memory/_delete.py
  - project: everos
    path: src/everos/memory/search/adapter.py
  - project: langmem
    path: src/langmem/knowledge/extraction.py
  - project: langmem
    path: src/langmem/knowledge/tools.py
  - project: langmem
    path: src/langmem/reflection.py
  - project: memobase
    path: src/server/api/memobase_server/controllers/buffer.py
  - project: memobase
    path: src/server/api/memobase_server/controllers/event.py
  - project: memobase
    path: src/server/api/memobase_server/controllers/context.py
  - project: anthropic
    path: src/anthropic/lib/tools/_beta_builtin_memory_tool.py
  - project: anthropic
    path: src/anthropic/lib/tools/_memories.py
---

## 先给选择结论与证据边界

这十个对象来自本次工程候选清单：Hindsight、Mem0、Graphiti、Letta Code、OpenViking、Cognee、MemOS、EverOS、LangMem、Memobase。它们不是某个评测的前十名，也不是按 GitHub stars 穷举排序；Anthropic 官方 SDK 是额外的设计对照，既有 ReMe 研究保留。

本轮为每个新项目读取固定 commit 的源码入口、数据模型、写入、检索、维护与相关测试。没有安装上游依赖、运行完整服务、调用模型或复跑 benchmark。源码能支持“当前控制流这样实现”，不能单独支持质量、延迟、成本收益或故障恢复已通过验收。

Mem0 与 Letta 沿用 2026-11-04 已完成十个切面的研究基线，本轮另拉取最新 main 并核查差异。Mem0 新增差异限于 Node 依赖与集成依赖升级，未改本次 Python 记忆主线；Letta 则新增压缩预算保护、修正含空格暂存路径等，本文不把这些新实现冒充成旧基线已覆盖。完整研究与拉取 SHA 见仓库 sources/acquisition-2026-11-07.json，差异和未验证范围见 sources/research-log.md。

## 同一句话，不同的记忆单位

共同输入是：“alpha 原来用 Python；现在决定改用 Rust，只影响新模块。”第二段问当前语言；第三段补录上月讨论；第四段要求撤回某条来源。这能区分记住新事实、理解适用范围、追溯历史和维护派生状态，而不只看搜索是否返回 Rust。

| 项目 | 主要状态与写入决策 | 读取与最终模型的边界 | 直接源码依据 |
| --- | --- | --- | --- |
| Hindsight | 来源文档、抽取事实、观察与知识页分开；retain 提取，整理独立执行 | recall 返回证据；reflect 在服务内运行只读工具循环回答，不自动把答案写回 | [MemoryEngine](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L16048) |
| Mem0 | 当前 Python OSS 默认 ADD-only 抽取，向量 payload 保存主记忆，SQLite 留历史与有限消息 | 语义候选先门控，再用关键词、实体信号加分；最终提示由宿主组装 | [写入与搜索入口](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)、[评分](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py) |
| Graphiti | episode 支撑实体与事实边，模型参与归一和矛盾识别，程序维护时间字段 | 基础搜索返回边，高级搜索选多对象配方；当前事实过滤需显式约定 | [Graphiti](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py)、[过滤模型](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/search/search_filters.py) |
| Letta Code | Agent 编辑 MemFS，Git 保存版本；本地核心提示从已提交文件编译 | core 进入提示，deferred 按需读，transcript recall 另一路；Cloud 内部不能由客户端补写 | [记忆格式](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts)、[提示投影](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| OpenViking | Session、资源和记忆用 URI 寻址；文件、任务与向量索引有不同完成点 | 当前检索器做一次全局向量搜索及可选 rerank；上下文流水线再按预算读层级内容 | [检索器](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/hierarchical_retriever.py#L103-L144)、[上下文组装](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py) |
| Cognee | 原始资料、chunk、图、向量、session 与 improve 状态分开 | recall 可只返回上下文，也可在库内回答；session 命中与永久图命中是不同路径 | [remember](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/remember/remember.py)、[recall](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/recall/recall.py) |
| MemOS | Cube 组织不同记忆组件；实际能力依赖选择的 text/pref 后端与调度 | search 按 Cube 返回；chat 另外检索并构建系统提示，不等同纯检索接口 | [MOSCore](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py) |
| EverOS | MemCell 来源、Markdown 记忆、SQLite 状态与 LanceDB 索引；用户与 Agent 两轨 | 按 owner 和类型选择检索流水线，算法部分来自外部 everalgo 包，本轮未进入其内部 | [写入编排](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py)、[检索适配](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/adapter.py) |
| LangMem | 进程内提取与工具原语，BaseStore 拥有记录与索引；应用负责调度和来源 | 搜索工具把 Store 结果交给 Agent，提示优化输出由应用采用，不是权重训练 | [StoreManager](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py)、[工具](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py) |
| Memobase | 以用户画像、事件和 gist 为主要长期对象；原始 blob 经 buffer 处理 | context 组合画像与 gist，画像筛选和事件语义检索不同；宿主消费 context 字符串 | [buffer](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py)、[context](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/context.py) |

上述每项都对应本轮所选运行表面，不是各产品全部能力的上限。例如 LangMem 使用何种 Store 会影响持久性；Graphiti 的搜索配方和后端会影响检索；MemOS 的接口存在也不证明每个具体后端已实现全部操作。

## Anthropic 应当加入哪一条比较线

[官方 SDK 的 Memory Tool](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py)提供模型可调用的文件操作，应用执行它，默认自持文件。它接近 Letta、EverOS 等按文件读写的观察面，但没有自动获得它们的版本、整理、索引或同步策略。

当前 SDK 的 [SessionMemoryStores](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py)又能为自托管 worker 下载并同步托管 store：按内容 hash 做合并，冲突采用远端，删除有确认保护。这是另一条客户端实现，不能用“Anthropic 只有本地文件”概括。服务端存储与摘要算法没有随 SDK 开放，本轮不替其补出内部架构。

具体见 [Anthropic 系统边界](../projects/anthropic/01-overview.md)、[文件与同步生命周期](../projects/anthropic/02-tool-lifecycle.md)、[上下文管理](../projects/anthropic/03-context-management.md)。这些机制可与记忆服务组合；它们不是互斥的数据库产品。

## 怎样按需求缩小候选

以下是基于上面实现的采用建议，属于推断，不是实测名次。

| 目标 | 先验证的候选 | 第一项需要观察的代价 |
| --- | --- | --- |
| 少量个人偏好、可直接审计修改 | 文件工具基线、EverOS；用户画像可加 Memobase 对照 | 文件发现与画像提取是否丢语境，删除是否回到来源 |
| 在已有应用旁增加独立记忆服务 | Mem0、Hindsight | 主动抽取、整理和重排的实际模型成本 |
| 事实关系不断变化，需要历史查询 | Graphiti；对照 Hindsight 时间检索 | 模型识别矛盾是否正确，时间过滤是否真正启用 |
| 长期 Agent 自己积累项目经验 | Letta Code；对照 EverOS Agent cases/skills | 何时写入、版本提交和下一次提示可见如何衔接 |
| 多类资料、记忆和技能统一组织 | OpenViking、Cognee、MemOS | 多阶段完成状态、后端配置与维护复杂度 |
| 已有 LangGraph，想自行控制记忆策略 | LangMem | 来源保留、授权、后台持久调度和并发事务由谁补齐 |

不建议在第一次试验里启用所有反馈、重排、反思和摘要模块。先记录最小有效路径，看到可定位的失败后再增加机制，才知道哪项复杂度真正改善了结果。

## 用同一组实验重新评估，而不是拼公开成绩

最低限度应保留原始输入、记忆落盘快照、每路候选、实际读取内容、最终模型请求与回答。固定回答模型、评分方式、查询次数和总 token 预算；写入完成也要约定是“受理”“抽取完成”“索引可见”还是“后台整理完成”。

公开评测可以分工使用：[LoCoMo](https://github.com/snap-research/locomo)观察长期对话利用，[LongMemEval](https://github.com/xiaowu0162/LongMemEval)增加更新、时间与拒答，[BEAM](https://github.com/mohammadtavakoli78/BEAM)扩大历史规模，[LongMemEval-V2](https://github.com/xiaowu0162/LongMemEval-V2)面向操作轨迹中的环境经验。它们属于官方评测说明，本轮没有复跑。

尤其不能把 Recall@k、答案正确率、内部任务提升与 GitHub stars 混成一个分数，也不能把托管平台成绩标到开源 SDK 上。新项目研究页分别列出可读的 benchmark 入口及其配置边界，下一步应先选择一个真实任务链完成同条件验证。

## 继续阅读

- 服务与图：[Hindsight](../projects/hindsight/01-overview.md)、[Mem0](../projects/mem0/01-overview.md)、[Graphiti](../projects/graphiti/01-overview.md)。
- 文件与 Agent：[Letta Code](../projects/letta/01-overview.md)、[OpenViking](../projects/openviking/01-overview.md)、[EverOS](../projects/everos/01-overview.md)。
- 平台与原语：[Cognee](../projects/cognee/01-overview.md)、[MemOS](../projects/memos/01-overview.md)、[LangMem](../projects/langmem/01-overview.md)、[Memobase](../projects/memobase/01-overview.md)。
- 同一个故事的维护边界：[更新、失效与删除比较](ten-framework-lifecycle.md)。

## 自测

1. 为什么“每个项目都调用一次 search”仍可能不是同条件的比较？
2. 若目标是个人记忆，哪些状态必须可审计，哪些可以只作为可重建索引？
