---
id: projects.hindsight.retrieval-lifecycle
title: Hindsight：从四路召回到答案，中间还改变了什么？
summary: 拆解 store-owned recall、融合重排与输出预算，追踪只读回答和删除后派生状态的维护。
project: hindsight
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - hindsight-api-slim/hindsight_api/engine/search/retrieval.py
  - hindsight-api-slim/hindsight_api/engine/memories/base.py
  - hindsight-api-slim/hindsight_api/engine/memories/postgres.py
  - hindsight-api-slim/hindsight_api/engine/memory_engine.py
  - hindsight-api-slim/hindsight_api/engine/search/fusion.py
  - hindsight-system-evals/README.md
---

## 结论与适用范围

Hindsight 的 recall 是一条可配置证据管线：查询准备、存储召回、各路融合、可选重排、预算裁剪和来源补齐。最终分数只表示这条管线的排序信号。reflect 再用只读工具循环回答，并不保证一次 recall 就足够，也不把答案自动存成新事实。本页只核验当前源码；没有取得真实准确率、费用或 P95 延迟。[recall 入口与参数](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L9465)

## 从“谁现在负责 alpha”走一遍

入口清理与截断查询，认证并解析 bank 配置、标签范围和预算，再生成查询向量。预算既影响检索工作量，也影响进入重排的候选；`max_tokens` 控制事实输出，不能替代所有检索和模型工作上限。时间窗口可以由调用者指定或由 query analyzer 从问题提取，随后交给 store 的 `recall_unified`。[统一检索编排](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/search/retrieval.py#L129)

默认 Postgres store 内部先执行 dense／BM25 查询和时间查询，再以 dense 命中为种子扩展图。它为多个 fact type 返回各路候选，外层不直接拥有每条 SQL。关闭关键词或图能力会跳过对应工作；时间分支也可能没有可用时间约束。**四路能力存在不等于每次调用都有四路有效结果**。[Postgres 各路职责](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memories/postgres.py#L126)

“现在”与历史检索尤其要核对。`temporal_window` 给时间路排序提供窗口，本身不排除其他时间的事实；`created_after/before` 在当前实现用于记忆变更窗口，实质对应 updated_at，服务于知识页增量刷新。把这些参数都当作“事件时间硬过滤”，会得到错误的采用结论。[参数语义](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L9537)

engine 在候选管线前还调用 `store.full_recall`；扩展 store 若能完成整个请求，可连融合、预算及来源补齐一并返回，默认返回 None 才继续。默认 Postgres 使用后续管线；其他后端的往返次数与排序执行位置必须按实现核验。[整轮召回委托](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L10132)

## 融合、重排与预算是三个不同关口

候选先按来源限制规模，避免单一路吞掉重排预算。engine 可使用 reciprocal rank fusion 或 interleave；选择 cross-encoder 时再构造候选负载评分。RRF 组合名次，不是把向量距离直接求平均；interleave 也不是 cross-encoder 的别名。代码还提供决策模型下的 prune、dedup 等选项，它们可引入额外判断请求，不能当作纯数据库过滤。[融合与重排主线](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L10570)

之后按输出预算组织事实、实体、observation 来源与 chunk。事实和原文 chunk 有独立预算：入口明确指出，即使 `max_tokens=0` 不返回事实，`include_chunks=True` 仍可能返回原文。这是实现上下文补齐的能力，也意味着计量实际输入时必须看全部返回通道，不能只统计 facts 文本。[输出预算边界](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L9509)

## 回答与长期整理分别发生在哪里

宿主直接用 recall 时，最终提示词、对来源指令的信任规则和回答模型由宿主控制。用 reflect 时，服务创建自己的 agentic loop，通过 lookup、recall、search observations、expand 等工具取得证据，并在最后一轮移除工具以收束答案。若提供 response schema，还存在后续结构化提取。源码将这个操作定义为只读；长期 observation 合并和 mental model 页面刷新应单独验收。[reflect 工具循环](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L16048)

因此，“反思让 Agent 越用越聪明”需要拆成至少两项观察：写入后的归纳是否改进，以及新的回答是否正确使用归纳。只看 reflect 文本更完整，不能证明长期状态发生了任何变化。

## 删除后为什么还要观察队列

当前文档删除会在事务中失效关联 observations，提交后尝试调度重新整理、派生知识页刷新和图维护。删除原文后立即查询、后台处理后再查询、重启后再查询应分别记录。物理附件清理是另一阶段；统计缓存失效是 best effort。这些实现支持明确的维护路径，但不能从静态阅读证明任意崩溃点都恢复一致。[派生维护与清理](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L11696)

## 测试与采用成本

仓库 system-evals 按 retain、recall、consolidation、reflect 和页面刷新划分质量问题，与 stub 系统测试区分；也说明不同真实模型会有波动。对本项目最有价值的实验是同一段事实先更正再删除：分别保存原始候选、融合结果、进入回答的上下文、后台状态和最终答案。跨用户同问要固定认证配置与标签，并测不带范围参数的调用。[质量评测边界](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-system-evals/README.md#L1)

费用需要覆盖写入抽取、embedding、归纳、页面刷新、查询 embedding、重排及 reflect 多轮调用；还包括数据库连接与维护吞吐。采用适合需要这些机制且愿意维护服务的团队。若只是少量稳定偏好，先用文件方案做相同任务基线，才能判断复杂度是否换来实际收益。

定位错误时先分层：若原文中存在而 facts 没有，检查抽取；facts 正确但候选没有，检查范围和检索；候选有但最后返回没有，检查重排与预算；返回正确但答错，再看宿主供给与回答。这样的排查顺序来自管线职责，不能用统一的“记忆准确率”替代。

## 口述自测

1. `max_tokens=0` 时为什么仍可能暴露原始资料？
2. reflect 回答正确与 observation 成功更新，分别应从哪里取证？
