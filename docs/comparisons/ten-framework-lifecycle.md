---
id: comparisons.ten-framework-lifecycle
title: 记忆更正与删除：十框架分别维护哪些状态？
summary: 逐项对照新增、失效、归档、物理删除、摘要修复与副本同步，建立来源到回答的验收范围。
project: comparison
projects: [hindsight, mem0, graphiti, letta, openviking, cognee, memos, everos, langmem, memobase, anthropic]
minutes: 20
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

## 先约定更正与删除的产品语义

本页沿与总览相同的十个固定版本及 Anthropic SDK，比较可读实现，不作性能排名，也没有运行更正或删除实验。所有“需要验证”均是静态设计边界，不是本轮已复现故障，更不是对云服务远程漏洞的断言。

同一段故事包含四个不同请求：把 alpha 当前语言改成 Rust；保留此前 Python 决策用于回顾；撤回一条错误会议记录；删除某个用户的所有内容。它们分别涉及当前事实、历史、来源撤回与主体清除。统一命名为 delete 或 update，并不能让状态传播范围自动相同。

一个可审计的状态账本至少包含：原始输入、提取事实、摘要/画像/技能、向量和图、缓存、会话/回答历史、后台任务、外部副本。存在某层不等于必须物理独立部署，但验收必须知道它由谁保存与清理。

## 新事实如何影响旧事实

| 项目 | 固定版本可见机制 | 不能扩大成的保证 | 源码 |
| --- | --- | --- | --- |
| Hindsight | retain 与后台归纳分开，reflect 只读；来源删除会触发派生状态失效和维护 | 每次 reflect 都会改写长期认知，或删除响应即所有知识页已刷新 | [MemoryEngine](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py) |
| Mem0 | 默认增量 ADD-only；显式按 ID update/delete 更新主记录及历史、实体引用 | 新消息自动覆盖全部旧事实；到期隐藏等于物理删除 | [Memory](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)、[SQLite 历史](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py) |
| Graphiti | 新关系可限定旧边有效区间；episode 删除保留仍有其他来源的边，尝试重建存活节点摘要，失败记录日志 | 默认 search 只取当前事实；删除来源后会自动重算所有历史区间 | [写入与 remove_episode](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py)、[显式过滤](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/search/search_filters.py) |
| Letta Code | 编辑工作树、提交 Git、同步、重编译和会话供给分别发生 | 文件修改立即进入本地核心提示；删除工作树文件就擦除 Git 与会话历史 | [Git 操作](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts)、[已提交投影](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| OpenViking | Session 分阶段提交，记忆文件更新与索引任务异步衔接 | 受理回执等于全部索引和摘要已可见 | [Session](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/session.py) |
| Cognee | forget 明确区分资料、dataset 与 memory_only；后者保留资料供重建 | 搜索空结果证明原文与回答历史都删除 | [forget](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/forget/forget.py) |
| MemOS | 具体后端有归档/融合路径，SDK 的 tree update、delete 适配要分别核验 | 统一接口名意味着每种后端实现和参数契约相同 | [MOSCore](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py)、[TreeTextMemory](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree.py) |
| EverOS | 反思先形成替代条目，再废弃旧项；部分 daily-log 写入有来源检查，索引由 Cascade 追赶 | 跨三层的全局原子事务；会话删除自动撤回综合画像与技能 | [删除编排](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_delete.py)、[写入编排](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py) |
| LangMem | StoreManager 与工具可增改删，但应用选择命名空间、调度和 Store | 多项 Store 写入共同回滚，或 namespace 本身提供身份授权 | [管理器](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py)、[工具](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py) |
| Memobase | 画像修改清缓存，事件与 gist 有独立状态；event_data 更新函数不重建 gist/embedding | 只改事件正文就同步了所有查询表示，或删 blob 就撤回画像 | [事件维护](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/event.py)、[context](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/context.py) |

每一行只是实现边界。完整条件、默认值与失败处理在各项目第三篇和既有 Mem0/Letta 生命周期章节中展开，不应把压缩后的表格当作全项目“支持/不支持”清单。

## 三种特别容易误判的完成点

**第一，主数据提交与派生更新。** Hindsight 的部分维护在事务提交后调度；Cognee 早期 chunk 索引可先于完整图完成；OpenViking 文件与向量消息有不同进度。观察一个成功响应时，需要追问它确认了哪个状态，而不是把后台处理仍在运行解释成检索质量差。

**第二，当前失效与历史删除。** Graphiti 通过 valid_at/invalid_at 等字段保留历史，Mem0 的历史表可保留旧值，Letta 的 Git 保存旧文件。业务的“忘掉当前错误”可能只要求不再用于决策；“清除用户数据”则需要声明更广的范围。前者不应默默承诺后者，后者也不能仅以搜索无命中作为证据。

**第三，源记录撤回与已提取知识撤回。** Memobase 将画像和事件独立保存，LangMem 由应用决定是否保存来源；某条源记录消失后，系统未必知道哪些长时记忆必须更正。Graphiti 的 episode 关联和共享边保留提供了更细粒度的来源管理，但摘要、有效区间及其他派生文本仍要分别检查。

上述区别来自矩阵的对应源码，设计后果属于推断；本轮没有做崩溃注入来证明任何系统永久丢失或保留了特定数据。

## Anthropic 展示了另一种副本问题

本地文件工具的 [`str_replace` 与原子替换](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L282-L304)避免读取半写文件，但没有为整个读改写增加多写入者 CAS。托管副本的 [`SessionMemoryStores`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L163)则保存内容 hash 基线、条件上传与未知响应状态。

这条同步链对删除有两个看似相反、实际服务不同目标的选择：整库本地 wipe 可能触发重新下载，以避免误删远端；远端删除遇到本地唯一未上传修改时，可写副本可能重建远端，以避免丢失唯一副本。正常缺失有确认窗口，最终 finish 又可跳过等待。它保护数据，但产品若承诺强制清除，就必须管理活跃副本与同步模式。

这些是开放客户端的可读策略，不能推广为所有托管环境内部的存储行为。更完整条件与版本清理接口见 [Anthropic 生命周期](../projects/anthropic/02-tool-lifecycle.md)。

## 隔离不是加一个 user_id 字段

十个项目至少有三种范围模型：bank/cube/dataset，文件 root/URI/owner，Store namespace 或 project+user。它们首先解决寻址；授权还需要可信身份与访问检查。不能让模型自由选择 ID 后，就把工具返回成功当作租户隔离通过。

对应项目研究中记录了可核验条件：Hindsight 默认 tenant extension 不要求认证；Graphiti 的空 group 范围不能直接当成当前用户；LangMem 库原语依赖宿主，部署认证图另有策略；Memobase MCP 示例默认同一用户。MemOS 文档还单独记录显式 Cube 列表分支与 tree 删除参数的静态适配风险。这些都应按所选运行表面和配置复测，不外推为远程服务已可被越权访问。具体定位见 [Hindsight](../projects/hindsight/01-overview.md)、[Graphiti](../projects/graphiti/03-retrieval-lifecycle.md)、[LangMem](../projects/langmem/01-overview.md)、[Memobase](../projects/memobase/03-retrieval-lifecycle.md)、[MemOS](../projects/memos/03-retrieval-lifecycle.md)。

## 建议的验收记录

| 样本 | 分别观察什么 | 失败如何解释 |
| --- | --- | --- |
| Python 改 Rust，但只限新模块 | 保存记录、作用范围、旧历史、实际模型输入 | 记住 Rust 仍可能过度覆盖旧模块 |
| 补录更早会议 | 事件时间、入库时间、有效区间和查询过滤 | 不能仅以最后写入作为最新事实 |
| 两条来源支持同一事实，删一条 | 来源关联、剩余事实、摘要 | 过度删除与撤回不足都是错误 |
| 更正后立即查询，再等后台完成 | 回执、任务、索引、缓存、最终回答 | 区分尚未可见与永久不一致 |
| 写入响应丢失后重试 | 请求 ID、已保存状态、重复模型费用 | 请求失败不等于服务端未执行 |
| 删除时另一个 worker 离线修改 | 副本基线、冲突、重建和最终清除范围 | 不能只在删除瞬间验收 |
| 跨用户同名项目和不带范围查询 | 实际授权身份、默认范围、显式覆盖路径 | 默认路径隔离不证明所有入口隔离 |

这些是待运行方案，不是新增实验结果。最先应执行自己产品承诺的关键状态链；若只要求个人偏好可编辑，不必先为每个后端做全套性能测试；若承诺来源级撤回或多租户服务，就应把传播与身份边界作为采用前置条件。

## 自测

1. 用户说“忘掉这次讨论”，你必须先区分哪几种数据与历史？
2. 如何证明模型下一次使用的是更正后的记忆，而不是恰好凭先验答对？
