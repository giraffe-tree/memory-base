---
id: projects.mem0.retrieval-context
title: 语义、BM25 与实体信号怎样共同排序？
summary: 当前候选来自语义检索，关键词和实体只加分；阈值门控原始语义分数，结果仍由宿主供给模型。
project: mem0
minutes: 11
status: source_verified
prerequisites: [projects.mem0.storage-index]
sources:
  - mem0/memory/main.py
  - mem0/utils/scoring.py
  - mem0/utils/lemmatization.py
  - mem0/utils/entity_extraction.py
  - mem0/vector_stores/qdrant.py
  - tests/utils/test_scoring.py
---

## 结论：不是两路并集，也不是 RRF

当前 Python OSS 搜索从语义检索结果构造候选池，再加入关键词和实体信号评分。某条记录仅在关键词分支命中、未进入语义候选池时，不会因为 BM25 很高就被补进最终列表。这一边界决定应该怎样设计召回实验。

本页静态核验 `ed1f10fc87080f0b67f99be370817504888462ab`，日期为 2026-11-04。没有运行真实检索质量评测；下面的分数例子仅用于解释源码算法。

## 一次查询怎样进入候选池

调用形式为 `search(query, filters={"user_id": "u1"}, top_k=20)`，身份 ID 必须放在 filters，不能沿用顶层 `user_id` 的旧式示例。查询需非空，参数校验后会准备增强过滤条件，再交给 provider。

`_search_vector_store` 先对查询做词形处理、提取实体，再生成 query embedding。语义和 keyword 分支各请求 `max(top_k * 4, 60)` 个候选，以便后续加分时有更大的排序池。主候选仍只来自 semantic results。

```text
query + filters
  → 词形处理 / 实体抽取 / query embedding
  → 语义召回 ───────────────────→ 主候选池
  → 关键词召回 → 归一化BM25 ─────→ 对候选加分
  → 实体collection → 关联ID加分 ─→ 对候选加分
  → 排除到期 / semantic阈值门控 / 组合评分 / top-k
  → 可选reranker → 返回文本与metadata
```

默认阈值为 0.1。到期记录默认从搜索隐藏，`show_expired=True` 才包含；这与数据库物理删除是两个动作。`reference_date` 在 OSS 中被拒绝，不能仅凭存在时间字段就宣称可以进行任意历史时点查询。

## 最终分数如何得到

BM25 原始值先经 sigmoid 归一化，参数按词形处理后的查询长度调整。实体加分最高量级为 0.5，并根据实体关联的记忆数量降低过于宽泛实体的影响。`score_and_rank` 对当前候选计算：

```text
final = min((semantic + normalized_bm25 + entity_boost) / divisor, 1)
```

divisor 初始为 1；本轮 BM25 分数表非空时加 1，实体加分表非空时再加 0.5。因此各信号的归一化基准按本轮实际信号变化，不是固定的一组加权概率。

语义 threshold 在合成之前生效。例如 semantic 为 0.08、threshold 为 0.1，即使 BM25 和 entity 很高也被剔除。反过来，过门控后归一化出的 final score 可以低于 threshold。这里的阈值不是最终结果分数的最低线。

`explain=True` 可返回 semantic、BM25、entity、原始合计、除数和最终分数，适合检查排序变化。分数不是事实准确率，不同 provider 的语义分值与不同活跃信号下的 final 值，也不能直接当成同一量尺横向比较。

## 实体分支能补充什么

查询实体至多取前八个再去重，批量 embedding 后查询实体 collection，按相似度和 linked memory IDs 形成加分。实体查找用身份 scope 缩小范围，主候选仍按完整 filters 查询。

若实体加载、embedding 或查询失败，代码通常告警并继续已有检索。实体缺失并不一定导致整次 search 失败；它可能表现为排序变了。BM25 也依赖后端、旧 collection 槽位和编码器状态，所以实验应记录哪些信号实际存在，不能仅记录“打开了混合搜索”。

## reranker 与上下文供给

只有调用 `rerank=True` 且配置了 reranker，才在初步 top-k 结果上再排序；失败时保留原结果。它不能挽回不在候选池中的记录，也不会自动核查每项自然语言事实。

返回结果包含记忆文本、ID、时间、scope 及 metadata，可选解释分数。宿主仍需选择多少文本进入实际模型输入，处理冲突、来源和 token 预算。当前这条搜索路径没有 ReMe 式 `tool_context_id` 已返回分块去重；重复查询行为应按 Mem0 自身实现测试，不能移植另一项目的状态假设。

## 源码定位

- [查询、候选池和可选重排](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`search`、`_search_vector_store`、`_compute_entity_boosts`。
- [归一化、语义门控和组合评分](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)：`normalize_bm25`、`score_and_rank`。
- [关键词 provider 实现](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/vector_stores/qdrant.py)：`keyword_search`。
- [评分算法单元测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/utils/test_scoring.py)：本页阅读未运行。

## 自测

1. 一条只在 BM25 命中的记忆，会自动进入当前最终结果吗？怎样用实验区分候选召回和排序加分？
2. 为什么 threshold=0.1 仍可能返回 final score 小于 0.1 的结果？
