---
id: projects.cognee.write-storage
title: Cognee：资料、图、向量与来源账本怎样衔接？
summary: 跟踪 add 与双阶段 cognify、Data 身份和来源回滚，解释可搜索时点与跨存储失败责任。
project: cognee
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - cognee/api/v1/add/add.py
  - cognee/modules/data/models/Data.py
  - cognee/api/v1/cognify/cognify.py
  - cognee/tasks/storage/add_data_points.py
  - cognee/modules/cognify/rollback.py
  - cognee/tasks/graph/extract_graph_and_summarize.py
---

## 结论与适用范围

Cognee 把资料身份与派生知识分开：关系层 Data 记录原始文件位置、owner、dataset、hash 和 pipeline 状态；图、向量与来源归属承载可查询的派生表示。当前默认 cognify 先运行无 LLM 的 indexing pipeline，再运行知识提取 pipeline。因此**可搜索早于完整构图，部分构图失败也不必让已索引 chunk 消失**。本页只核验固定源码，没有跨存储故障注入。[双管线任务定义](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/cognify/cognify.py#L690)

## add 为谁建立什么身份

`add` 先初始化、迁移与解析具有写权限的 dataset，再运行 ingest 任务。当前 Data 主键是随机 UUID；内容 hash 是按 dataset、owner 查询重复内容的依据，而不是主键本身。相同内容写入不同 dataset 对应不同资料行，更新其中一份不应修改另一份。Data 同时保留原始／处理后位置、mime、外部元数据、系统元数据以及按 pipeline／dataset 组织的状态。[Data 定义](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/data/models/Data.py#L10)

重复与更新也有不同入口。add 在管线写入之前拒绝“相同文件身份但正文已改变”的情况，要求用 update 保留 data_id；内容重复可复用已有记录。这样避免一次普通新增静默重写别人正在引用的来源，但不等于数据库对每种输入形态都提供一个全局内容唯一约束。[资料前置校验](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/add/add.py#L327)

## 从资料到检索对象的两个里程碑

以一份项目说明为例，indexing pipeline 使用与后续相同的分块逻辑，保存 document/chunk 到图和 chunk 文本到向量库；它不做 LLM 提取。此时 CHUNKS、词法或基于 chunk 的回答已有基础。第二段 cognify 重新获得这些块，查找已有 embedding，避免再次向量化，再提取实体关系并写摘要与关系索引。[早期索引任务](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/cognify/cognify.py#L743)

`extract_graph_and_summarize` 的 from_extraction 分支先提取图，再根据结果生成摘要；llm 分支并发进行提取与摘要。二者会产生不同模型调用和可能不同的信息损失。总结文本不是原始资料的替代品：抽取漏掉的约束仍需回到 chunk，不能在知识图命中率里掩盖。[提取与摘要分支](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/tasks/graph/extract_graph_and_summarize.py#L15)

## add_data_points 的关键存储边界

任务先将 Pydantic DataPoint 展开成节点与边，去重，补齐关系属性，再按 unified engine 的能力选择写入方式。当前已废弃 triplet embedding，关系检索使用 `EdgeType_relationship_name` 等索引；不能沿旧架构把 `Triplet_text` 当成当前必有的主召回源。[存储任务入口](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/tasks/storage/add_data_points.py#L76)

来源归属有两条路径：支持 graph provenance 的新图将来源引用折进图写入；另一类后端先写关系型 ownership ledger，再写图与向量。前者尽量避免“对象存在但尚无来源”的窗口；hybrid 能力下部分来源仍有第二步附加。后者先留恢复账本，使图／向量失败后仍知道该清理哪些对象。源码存在这些防护，但**不代表关系库、任意图与任意向量后端共享一个分布式事务**。[归属与写入顺序](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/tasks/storage/add_data_points.py#L160)

还应区分两种同名概念：`PROVENANCE_TRACKING` 控制额外的审计来源任务，默认关闭；存储与回滚用的基础来源 ownership 另有实现。没有开启审计任务不等于所有删除归属信息都不存在，开启审计任务也不能让所有后端变成同一事务。

## 失败回滚按谁拥有的产物清理

`cognify_rollback_handler` 用 pipeline_run_id、dataset 和实际处理的 data_id 确定范围。graph provenance 后端撤销该 run 的引用，只删除不再有归属的对象；关系账本路径先找共享 slug，再删本次独占的图／向量对象，最后删除 ledger 与重置 pipeline 状态。顺序刻意使外部删除失败时保留恢复依据。[rollback 主线](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/cognify/rollback.py#L92)

它还区分本次已处理记录与原先就完成而被跳过的记录。启动恢复可保留本次已完成资料，内联失败默认回滚本次 run。indexing 与 cognify 的 run_id 不同，因此知识提取失败的回滚可保留先前索引 chunk。调用异常后要看具体 pipeline 状态与产物，不能断言原始资料和所有搜索能力同时不存在。

## 隔离与恢复的采用要求

Data 的 owner/dataset 身份、授权 resolver、数据库 handler 和 task context 必须一起生效；只过滤向量 payload 不足以覆盖原始文件、图与操作记录。备份恢复也应覆盖关系注册表、原始文件与所选图／向量后端，单独导出一个索引不代表可重建完整系统。

本轮没有验证物理落盘、kill 后恢复或去重并发。建议用两资料共享实体、重复提交、单资料替换、构图一半失败四组样本，核对来源、图、向量、运行状态及重试费用。

## 口述自测

1. 知识提取失败后仍能 CHUNKS 搜索，为什么不一定是回滚失败？
2. 为什么先删图／向量再删恢复账本，比反过来更便于重试？
