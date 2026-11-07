---
id: projects.graphiti.retrieval-lifecycle
title: Graphiti：检索当前事实和删除历史来源分别要做什么？
summary: 区分基础与高级搜索配方、时间过滤、分组路由及 remove_episode 的共享关系与摘要修复。
project: graphiti
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - graphiti_core/graphiti.py
  - graphiti_core/search/search.py
  - graphiti_core/search/search_filters.py
  - graphiti_core/search/search_config_recipes.py
  - graphiti_core/decorators.py
  - tests/evals/eval_e2e_graph_building.py
  - tests/utils/search/test_edge_cross_encoder_rrf_shortlist.py
---

## 结论与研究范围

Graphiti 基础 `search` 返回事实边，高级 `search_` 可返回节点、边、事件和 community，并选择不同召回与重排配方。图保存时间字段，并不使默认查询自动只返回当前关系；删除 episode 也要处理共享来源和存活节点摘要。本页只核验固定源码，没有运行质量、跨组隔离或删除恢复实验。[基础与高级入口](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1913)

## 从问题到候选的两种默认行为

问“谁现在负责 alpha”，基础 search 在没有中心节点时采用 `EDGE_HYBRID_SEARCH_RRF`：事实边 BM25 与 cosine 召回后做 RRF。有中心节点时换成 node-distance 排序，用图距离表达上下文接近性。高级 search_ 默认 `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`，可同时搜索多种对象并做 cross encoder，成本与返回语义都不同。[配方定义](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/search/search_config_recipes.py#L81)

底层 `search` 验证 group 列表，空白查询返回空结果；仅在配方需要向量或 MMR 时生成 query embedding，调用者也能提供 query_vector。随后对启用的 edge、node、episode、community 范围并发检索，再返回各自结果与重排信号。**有 graph driver 不等于每次搜索都走 BFS，选用 RRF 也不必调用回答 LLM**。[统一检索函数](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/search/search.py#L110)

基础 search 直接返回 `EntityEdge` 列表，并不生成自然语言答案。最终拼入上下文的事实数、来源格式、历史与当前事实的解释以及拒答策略仍由宿主确定。高级搜索用 cross encoder 排名时，模型或重排器也不替代最后的业务回答；要明确两者调用成本。

## 时间与分组必须成为显式契约

`SearchFilters` 对 valid_at、invalid_at、created_at、expired_at 提供条件组合，同时可限定端点、边类型和属性。基础入口未传过滤器时创建空 `SearchFilters()`，因此不能仅据 API 注释把其描述成“自动过滤过期事实”。若要回答某日的有效负责人，需要根据有效区间构造过滤，并对缺失时间制定业务规则。[时间过滤对象](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/search/search_filters.py#L58)

没有提供 group_ids 的路径也不能当作当前用户自动隔离。底层把空列表归为无 group 限制；调用方应从认证结果推导范围并拒绝越权。FalkorDB 的装饰器为单个 group 克隆对应 graph driver，多组则逐组搜索再合并；其物理路由与其他后端不同，必须在实际后端验证“不带组”和“多组”的行为。[group 路由](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/decorators.py#L30)

## remove_episode 做到了什么

当前删除实现先取 episode 及关联事实边，移除每条边的该 episode 来源。还有其他来源的边保留并保存；不再有来源的边才删除。对于实体，统计 mentions，只被此 episode 提及的节点删除，其余节点保留。它比“删除一个事件就删光其实体关系”更谨慎。[来源级删除](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L2174)

然后代码根据剩余 episodes 分批重新抽取存活节点摘要，避免旧摘要继续陈述已删资料。但这些操作依次执行，不在一个统一事务里；摘要重建失败会恢复内存中的旧摘要、记录日志，不把异常传播成整个删除失败。因此一次 remove_episode 正常返回仍需核对摘要是否修复，不能声称所有派生文本已严格抹除。[摘要重建与异常处理](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L2218)

还有一个待验证问题：删除使某条旧关系失效的来源后，是否应重新打开先前的关系有效区间？本页所读 remove_episode 没有看到普遍的时间区间重算流程，不能据此承诺自动恢复。community、saga 与外部导出的副本也应按实际配置单独检查，不能从 episode 删除扩大为所有派生状态清除。

## 质量、可观测性与成本怎么验收

核心路径有 tracer，记录查询阶段、对象数量和写入的失效边数量；它能帮助定位时间花在 embedding、候选还是模型决策，但 trace 成功不是事实正确。仓库评测脚本读取 LongMemEval 数据并显式构图，测试参数包含模型、session 数和长度，本轮未执行，不能输出分数或跨框架名次。[构图评测](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/tests/evals/eval_e2e_graph_building.py#L77)

建议采用同一人物与项目变更集，包含同名实体、重复来源、乱序旧事实、未来计划及删除后重启。分别验收提取关系、有效区间、过滤候选、实际供给答案和摘要；成本记录写入的多次模型决策、实体／事实 embedding、数据库检索、可选 reranker 与 community。图方案的采用依据是关系和时间任务的收益，而不是“支持混合检索”这个标签。

重排之前的截断同样影响结果。仓库专门有合成回归测试：BM25 长列表不能把 cosine 第一名挡在 cross encoder 外，先用 RRF 形成候选短名单，再重排。这能核验候选供给机制，仍不能证明真实问题的答案正确；本轮只读该测试，没有运行。[候选短名单测试](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/tests/utils/search/test_edge_cross_encoder_rrf_shortlist.py#L25)

## 口述自测

1. 不传 SearchFilters 时，为什么不能承诺只返回当前有效关系？
2. 两个 episode 支持同一条边，删掉其中一个后，边、摘要和有效区间各要检查什么？
