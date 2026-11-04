---
id: projects.mem0.storage-index
title: 主记忆、关键词向量与实体索引怎样持久化？
summary: 用默认 Qdrant 路径辨认主记录与派生信号，说明 SQLite、旧 collection 和依赖降级的恢复边界。
project: mem0
minutes: 10
status: source_verified
prerequisites: [projects.mem0.memory-model]
sources:
  - mem0/memory/main.py
  - mem0/memory/storage.py
  - mem0/vector_stores/base.py
  - mem0/vector_stores/qdrant.py
  - mem0/vector_stores/configs.py
  - mem0/configs/vector_stores/qdrant.py
  - mem0/utils/entity_extraction.py
  - mem0/utils/spacy_models.py
---

## 结论：向量库同时持有正文

Mem0 的 vector store 不只是可随意清空的搜索缓存。Python OSS 将记忆文本放在该 store 的 payload 中，同时保存向量和相关 metadata。SQLite history 与近期消息是另外的持久状态；仅保留十条消息不能保证丢失主库后重建全部知识。

本篇静态核验 2026-11-04 基线 `ed1f10fc87080f0b67f99be370817504888462ab`，重点跟踪默认 Qdrant provider；没有对所有 provider 做一致性、持久化或恢复实测。

## 默认配置会连接哪里

`VectorStoreConfig.provider` 默认为 qdrant。Qdrant 配置默认 collection 是 `mem0`，维度 1536，local path 是 `/tmp/qdrant`。提供 client、host/port 或 url 等连接配置后，会走相应客户端连接方式。`on_disk` 控制向量存放选项，不能代替对 local path、服务端持久卷和备份的检查。

SQLite 路径默认位于 `MEM0_DIR` 或 `~/.mem0` 下的 `history.db`。因此主记忆和历史默认就不在同一个数据库事务或同一目录树。部署时需要一起记录路径与配置，不能只备份 home 目录便默认覆盖主记录。

| 部分 | 默认或主要持有者 | 丢失后的影响 |
| --- | --- | --- |
| 记忆正文与 scope | 主 vector collection 的 payload | 主知识内容可能丢失 |
| dense embedding | 同一主记录 | 语义检索需重新计算或恢复 |
| BM25 sparse vector | Qdrant 的 `bm25` 命名槽 | 关键词信号可能不可用 |
| history / messages | SQLite | 变更回看、近期上下文受损 |
| 实体文本与记忆 ID 关系 | 独立 entities collection | 检索实体加分和关联受损 |

## BM25 并不总是启用

Qdrant provider 新建 collection 时配置 dense vectors 与 `bm25` sparse slot，插入记录时根据 `text_lemmatized` 等内容尝试编码稀疏向量。关键词搜索先检查 collection 是否有相应槽，再加载 fastembed 的 `Qdrant/bm25` 编码器。

已有旧 collection 缺少 sparse slot 时，代码保留语义检索并警告关键词分支不可用；它不会仅因升级 SDK 就自动把旧库迁移成新结构。缺少 fastembed 或编码器加载失败，也会让 BM25 路径降级。故“provider 支持 keyword_search”只是必要条件之一，实际是否产生稀疏索引与命中需要检查具体 collection 和依赖。

## 实体索引不是主记忆之间的知识图谱

`entity_store` 懒初始化时复用 vector provider 与配置，换成带 entities 后缀的 collection；某些 local provider 会共享 client 以避免路径锁冲突。实体 payload 保存实体文本、类型、`linked_memory_ids` 和身份 scope。

实体来自 spaCy 分析，包括名字、引号词和技术标识等。批量提取后会合并相关记忆 ID，再更新或新增实体记录。这层主要为后续搜索提供加分，不承担自然语言事实版本、完整因果关系或来源撤销的权威语义。

spaCy 模型加载器使用 `en_core_web_sm`，缺失模型时可能尝试下载，加载失败后返回不可用状态；实体抽取可退化为空。中文质量不能由英语模型的实现推导得出。这里也不能把“使用本地向量库”扩写成“首次执行不会访问网络”。

## 锁与故障保证到哪一层

Qdrant local 模式为共享 client 的写操作配置进程内重入锁，降低线程间更新、删除交错风险。这个锁不是跨进程事务，也不覆盖 SQLite、主 collection 和实体 collection 的统一提交。

实体写失败通常告警，history 失败有回退，主记录可能已经保存。这要求恢复时先检查实际状态，不要假定异常代表没有副作用。当前阅读范围没有确认一条“从完整原始会话自动重建全部主记忆”的通用修复路径；采用前应明确备份与重放所需来源由谁持有。

例如部署迁移后，先按已知 memory ID 读取正文，再在相同 scope 查询，分别验证记录存在与搜索可用。正文存在而 BM25 缺失，属于检索信号问题；主 collection 为空但 history 仍在，则是另一类内容恢复问题，两者不能采用相同的清库重建动作。

## 源码定位

- [主 store 与实体 collection 装配](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`Memory.__init__`、`entity_store`。
- [默认 Qdrant 配置](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/vector_stores/qdrant.py)。
- [collection、BM25 与 local 锁](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/vector_stores/qdrant.py)：`create_col`、`insert`、`keyword_search`。
- [SQLite 独立存储](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)与[spaCy 依赖加载](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/spacy_models.py)。

## 自测

1. 为什么清空 Mem0 主 vector collection，不能像清空纯搜索缓存那样处理？
2. 升级后仍没有 BM25 命中，应分别检查 collection 结构、依赖与实际写入的哪些状态？
