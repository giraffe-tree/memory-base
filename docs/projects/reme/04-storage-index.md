---
id: projects.reme.storage-index
title: 文件、分块、图和索引分别归谁持有？
summary: 理解 LocalFileStore 的组合结构，以及源文件、持久快照与派生索引的不同恢复路径。
project: reme
minutes: 11
status: source_verified
prerequisites: [projects.reme.memory-model]
sources:
  - reme/components/file_store/local_file_store.py
  - reme/components/file_graph/local_file_graph.py
  - reme/components/file_catalog/local_file_catalog.py
  - reme/components/file_chunker/markdown_file_chunker.py
  - reme/steps/index/init_changes.py
  - reme/steps/index/update_changes.py
  - reme/steps/index/reindex.py
  - tests/unit/test_file_store_consistency.py
  - tests/unit/test_reindex.py
---

## 先分清三种“存储”

记忆正文保存在用户工作区文件中。`LocalFileStore` 持有从文件生成的分块，并组合文件图、关键词索引、可选 embedding 与标签索引。磁盘上的压缩快照保存这些派生状态，帮助重启恢复，但不是替代原始笔记的唯一知识载体。

本篇基于 2026-11-04 静态核验的 commit `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9`。讨论的是默认 local backend；Faiss、Zvec 的额外索引行为尚未在本篇逐项验证，也没有做破坏性恢复实验。

## 各层具体持有什么

| 对象 | 内存职责 | 持久化与来源 |
| --- | --- | --- |
| 工作区文件 | daily、digest 等正文 | 可读文件，是重建内容的来源 |
| `LocalFileStore.file_chunks` | chunk ID 到分块记录 | `file_chunks_<name>_<version>.jsonl.zst` 等快照 |
| `LocalFileGraph` | 文件节点与 wikilink 关系 | 图节点快照，由文件解析结果得到 |
| `BM25Index` | 文档 ID、词项及倒排状态 | 关键词索引快照，可由分块重新建立 |
| `LocalTagIndex` | 标签到文件路径等映射 | 来自节点 frontmatter，可重建 |
| `LocalFileCatalog` | 独立维护的路径与修改时间记录 | 用于资料、Dream 等流程的变化追踪 |

Catalog 与 Graph 不应混为一谈。它们都可能使用 `FileNode`，但 catalog 是某条处理链的进度视图；graph 还承载出链与分块关联。同一文件可在不同 catalog 中有不同处理水位，因此“已经进 catalog”不证明它已经完成索引或语义整理。

## 一次 Markdown 修改怎样进入索引

启动时 `InitChangesStep.diff` 比较监听范围内的文件路径与 mtime，产生 added、modified、deleted 事件；后续监听处理持续变化。默认监听范围是 daily 与 digest 的 `.md`，不是工作区中任何文件都会自动进入搜索。

`UpdateIndexStep.build_item` 在读取前后保留文件版本信息，再调用 chunker 构造节点和分块。Markdown chunker 分离 frontmatter、正文与 wikilink，通常按标题树组织分块；章节过多时回退到普通文本分块，以避免过大的 AST 开销。结果保留原文件的行号信息。

索引发布前，`UpdateIndexStep._try_upsert` 在 store 的维护 guard 内再次检查来源版本，避免等待锁期间文件被改写后，把过时读取结果发布成当前状态。遇到来源变化有有界重试，持续变化仍可能失败，不能解释为任何频率的写入都绝不丢更新。

`LocalFileStore.upsert` 替换旧文件的分块、更新图及搜索结构。文件删除事件则删除对应派生记录。这些步骤由同一存储组件协调；原始文件的落盘与这些派生更新仍不构成一笔跨层事务。

## 重启时怎样发现不一致

`load()` 先载入分块快照，然后检查文件图所引用的 chunk ID 集合与实际分块集合。若发现缺失或孤儿分块，`_repair_graph_chunk_consistency` 清理派生 store 状态，使随后启动扫描把源文件重新识别为待处理，而不是永久相信“文件已索引”。原始笔记不会因此被删除。

之后它同步标签索引和 BM25，并在配置向量能力时启动缺失向量回填。这个顺序说明“组件加载完成”“后台修复完成”和“所有查询分支已经可用”可能是不同事件。正常关闭时，各组件保存各自状态，避免依赖被重复落盘；突然退出仍需恢复逻辑处理快照之间的不一致。

## reindex 与重扫文件有何区别

`ReindexStep` 委托 `file_store.reindex(scope)`，支持 `all`、`bm25`、`embedding`、`tag`。它从已经 ingest 的分块或文件节点重建相应搜索结构，**不重新扫描工作区正文**。

因此手动改了文件但尚未重新分块，直接 reindex BM25 仍可能重建出基于旧 chunk 的索引。修复动作应对应损坏层：关键词派生状态错了可重建 BM25；源文件变化未被消费，需要文件扫描与更新链路；不能为了修索引删除记忆正文。

## 源码定位

- [LocalFileStore](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py)：`load`、`_repair_graph_chunk_consistency`、`upsert`、`reindex`。
- [变化扫描](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/init_changes.py)与[版本检查和更新](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/update_changes.py)。
- [恢复边界测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_file_store_consistency.py)与[reindex 委托测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_reindex.py)。

## 自测

笔记已更正但搜索仍返回旧内容，应先检查文件监听、chunk 还是 BM25？如果图快照尚在而 chunk 快照丢失，为什么仅相信文件 mtime 会让故障长期隐藏？
