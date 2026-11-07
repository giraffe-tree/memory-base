---
id: projects.cognee.retrieval-lifecycle
title: Cognee：recall、improve 与 forget 的完成条件为何不同？
summary: 拆解规则路由、多通道 HybridRetriever、会话维护和删除范围，建立按实际状态验收的接入方式。
project: cognee
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - cognee/api/v1/recall/recall.py
  - cognee/api/v1/recall/query_router.py
  - cognee/modules/retrieval/hybrid_retriever.py
  - cognee/api/v1/improve/improve.py
  - cognee/api/v1/forget/forget.py
  - cognee/eval_framework/beam/eval/beam_eval_adapter.py
---

## 结论与研究范围

Cognee 当前把“读记忆”设计为可路由的多源操作，把“改进”设计为分阶段维护，把“遗忘”设计为按目标删除。三者的状态和费用不可互相替代：recall 可读取 session 或图、也可生成答案；improve 有可跳过与非致命失败；forget 默认不保证底层字节擦除。本页为固定源码核验，未运行真实模型和存储。

## recall 先决定读哪里，再决定怎样读

入口把 scope、session_id、dataset 和 query_type 转成具体通道。典型默认路径是只给 session_id 时先做 session 关键词搜索，命中便不查永久图；同时给 dataset 时可组合读取。显式 scope 可以读取 trace、session_context、代码或其他通道。底层默认分支以源码为准，不宜只凭参数组合的口头说明扩展所有情况。[scope 解析](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/recall/recall.py#L549)

永久图的自动 query router 使用规则，不调用 LLM 分类；未命中规则通常选 HYBRID_COMPLETION。它根据可用模型、Cypher 策略和过滤能力进一步调整；没有 LLM 时可转成只返回上下文。手动指定 query_type 会改变路由契约，应把这类配置记录进评测，不能把所有 search type 归成一个默认模型策略。[查询路由与约束](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/recall/query_router.py#L1)

## HybridRetriever 如何提供证据

HybridRetriever 一次生成 query embedding，随后并行取 chunk／摘要与实体／关系候选。实体侧按名称向量定位节点，再读取图邻域；关系名向量提供 facts 线索，并受实体可达范围与预算控制。它还可使用 importance、用户偏好权重和可选 truth 信息；不是只把向量库 top-k 原样返给模型。[候选获取](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/retrieval/hybrid_retriever.py#L138)

候选再被格式化成上下文；全局摘要是可选通道。默认空上下文跳过回答 LLM，正常 completion 可经 session manager 生成并保存交互，也可直接调用生成函数；include_references 决定引用附加。`only_context` 用于观察检索供给，不能与生成答案混记成相同“正确率”。[回答与会话接入](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/retrieval/hybrid_retriever.py#L314)

例如历史里同时有“用 Python”和“改 Rust”，需要分别查看 chunk、关系、冲突信息与进入最终提示词的内容；只看自然语言答案碰巧选 Rust，无法定位更正来自图、会话上下文还是模型先验。

## improve 不等于一次全量重建

当前 improve 注册阶段包括反馈权重、会话 QA／trace 持久化、经验上下文提取、蒸馏、偏好更新、truth、冲突审查与全局上下文索引。各阶段先检查条件；无 session_ids 时会跳过会话来源工作，无可用 LLM 时跳过需要写文本的阶段。它与 add/cognify/forget 共用 dataset 锁，避免同份数据维护互相穿插。[improve 契约](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/improve/improve.py#L141)

会话 QA 持久化失败是致命错误，其他阶段一般记录失败继续，模型预算耗尽则跳过后续阶段。remember 中自动 improve 失败还可能只记在 improve_error，因为资料或 session 已经成功写入。故完成响应要展示每阶段结果，不能只检查顶层没有抛异常。

会话缓存和自动反馈也是独立费用项。带 session 的回答可以分析用户新消息对前一轮的反馈；关闭自动反馈保留会话能力，关闭 caching 则改变记忆路径本身。测性能时应报告开关与实际模型请求数，不能将关闭核心层的结果当完整默认系统延迟。

## forget 精确区分资料、记忆与历史

forget 支持某条 data、整个 dataset、当前用户可删除的数据集合，以及 `memory_only`。后者保留原始文件与资料记录，移除图／向量并重置处理状态，方便按新配置重建；搜索为空不能证明原始资料已删除。[删除目标与语义](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/forget/forget.py#L24)

单资料删除默认保留搜索／回答历史，因为历史按 dataset 记录，不能可靠按文档剥离；`clean_history=True` 删除调用者自己的搜索历史。dataset／全量删除另有相应历史清理。删除完成也不等于物理字节擦除：LanceDB 追加片段和嵌入图文件各有压缩／回收行为。产品若承诺彻底删除，应包含原文、图向量、session、历史与引擎物理回收的明确范围，而不是只验证 recall 不再命中。

## 评测与采用条件

仓库包含 BEAM 评分 adapter：将问题、实际答案、golden answer 与可选检索上下文交给 rubric／Kendall 指标，异步并发评测。这只是可见评分路径，不是本轮结果，也不自动证明当前默认 remember/recall 配置和任何公开分数一致。[评分 adapter](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/eval_framework/beam/eval/beam_eval_adapter.py#L23)

采用测试应固定 dataset 权限、extractor、缓存与反馈、query_type、only_context 和 auto_improve，分别记录写入、早索引、完整图与维护后的质量。成本包括资料解析、embedding、模型提取、可选摘要与维护、检索与回答、反馈分析以及存储；先验证所需通道，再启用确有收益的阶段。

## 口述自测

1. session 命中与图命中是否应在同一个检索质量数字里混算？
2. memory_only 后资料能否再次出现，怎样证明产品承诺的删除范围？
