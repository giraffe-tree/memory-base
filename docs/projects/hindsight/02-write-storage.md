---
id: projects.hindsight.write-storage
title: Hindsight：一次 retain 的提交边界在哪里？
summary: 追踪提取、文档分块、事实与关系提交，解释 delta retain、流式批次和恢复检查点的不同保证。
project: hindsight
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py
  - hindsight-api-slim/hindsight_api/engine/retain/types.py
  - hindsight-api-slim/hindsight_api/engine/memories/postgres.py
  - hindsight-api-slim/hindsight_api/engine/memory_engine.py
---

## 结论与研究范围

Hindsight 的 retain 把模型提取与存储写入分开，并为文档更新、增量分块和流式恢复维护独立状态。默认 Postgres 路径在一个事务内写事实及检索关键关联，但**一次大请求可分成多个已提交批次**，事务内原子性不能扩展为整个资料、所有派生归纳和外部附件的统一原子提交。本页固定当前基线，源码核验，不代表崩溃实验通过。[retain 编排入口](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L1617)

## 数据模型从原文到事实

以“11 月 alpha 由小王负责，12 月交给小李”为例，原文属于 document/chunk；提取出的事实有 `fact_text`、`fact_type`、`occurred_start/end` 和 `mentioned_at`，实体名称与因果关系由模型提供。`ProcessedFact` 附加 embedding、来源 chunk、document 和程序侧 ID。事件发生时间与说出这句话的时间可不同，不能都替换为数据库创建时间。标签是可见范围的重要输入，来源引用则让后续 expand 和删除能定位依赖。[抽取与处理对象](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/types.py#L323)

`retain_batch` 首先检查 store 可写、bank 是否仍存活，并探测近期失败的 embedding 服务，避免先付抽取费用再发现向量不可用。随后按文档组织输入、确定配置与更新模式。模型不是直接执行 SQL：`_extract_and_embed` 调用事实抽取，应用可选事实过滤器，给保留的事实加日期增强文本，再批量 embedding。[提取与 embedding](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L1426)

## 默认 Postgres 的三段责任

| 阶段 | 主要动作 | 完成后能说明什么 |
| --- | --- | --- |
| 预处理 | 抽取、实体预解析、ANN 预查 | 已产生候选，尚不能保证事实已落盘 |
| 提交 | 插入事实、unit_entities、时间／语义／因果链接 | 本事务覆盖的检索关键数据提交 |
| 后处理 | 最终 ANN、整理、附加维护 | 派生质量和可见内容继续变化 |

`_insert_facts_and_links` 在调用方事务内插入事实，重映射占位 ID，再重新确认实体父记录，避免实体清理与本批写入的竞态。用于检索的实体关联是 `unit_entities`；代码明确将 UI 图展示关系与检索必需数据区分。outbox callback 也在这段事务内执行，因此通知登记可与该事务耦合；这不意味着外部 webhook 接收方已经处理完成。[事实与关键链接](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L879)

默认 `PostgresMemories.insert_facts` 的 INSERT 同时进入其索引，不存在同一接口上额外的异步 index commit。但当前还定义了其他 store 能力：有的 store 自己拥有 document、事实与索引。它们通过相同扩展边界完成写入，不能把 Postgres 的连接事务保证照搬过去。[默认写入实现](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memories/postgres.py#L84)

## 重复、更改和重试分别识别什么

同一 document 再次提交时，delta retain 按 chunk 内容判断哪些未变，保留其既有事实、实体与链接；改变的部分重新处理。`force_reextract` 可以突破内容完全一致时的跳过，使新配置下重新提取成为显式动作。因此“重复提交没有新增”既可能是缓存／恢复命中，也可能是增量策略，不能据此推断抽取模型认可了所有旧记忆。[增量与强制重提取分支](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L1965)

append 路径先读持久化正文及 hash，将其与新增内容合成；后续写入核对基底，防止两个追加者各自读旧版本后互相覆盖。文档、内容、分块有各自标识，大资料拆成子批次时还需 `chunk_index_offset`，否则后续批次的 chunk_id 会覆盖前批。这里的保护围绕文档版本和分块身份，不是对任意同义句进行全库 exactly-once 去重。[append 基底检查](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L1988)

流式写入将已经提交的事实记录到 operation checkpoint，恢复时可跳过已完成 chunk；检查点记录有 `facts_committed`、计数与文档集合。中途异常后，调用者应读取 operation、document 和实际事实，不能把异常理解为零副作用。模型调用也不在数据库回滚范围内，重试可能重复付费。[检查点实现](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L111)

## 删除与恢复的后半段

`delete_document` 认证并检查写权限后，在事务中按 bank、document、来源事实的锁顺序删除，前后清理依赖 observation；附件文件删除、统计缓存失效、consolidation、知识页刷新与图维护在提交后继续。已经删除主事实与所有派生页面都已更新是两个时点。开启特定 trace 删除配置也只覆盖其声明的日志范围，不能泛称所有副本擦除。[删除入口](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L11547)

一个值得借鉴的实现取舍是把慢的外部推理移出关键写事务，让事务主要保护检索需要的数据。这样减少长时间持锁，但预解析与提交之间必须再次确认实体存在，也必须处理正文版本变化。这不是“没有一致性”，而是用版本检查、重新确认、批次检查点与后续清理组合完成，实际保证要按每一条状态路径评审。

## 口述自测

1. 大资料写到一半进程退出，为什么需要检查点，而不是只依赖一次 SQL rollback？
2. 同样的正文改了提取配置，怎样区分“应当复用”与“需要重新抽取”？
