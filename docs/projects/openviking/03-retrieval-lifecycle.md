---
id: projects.openviking.retrieval-lifecycle
title: OpenViking 如何把候选记忆压进有限上下文？
summary: 召回、读取深度、预算、跨轮去重和可选改写由独立上下文流水线完成；文件与索引的生命周期必须联合观察。
project: openviking
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - openviking/service/search_service.py
  - openviking/retrieve/hierarchical_retriever.py
  - openviking/retrieve/context_assembler/pipeline.py
  - openviking/storage/viking_fs/_access.py
  - openviking/session/memory/memory_updater.py
  - benchmark/longmemeval/openviking/run_eval.py
---

## 检索结果与模型输入分两层

固定版本 `1bee73853e2400086632596198282f3c5d118312` 的 `SearchService` 暴露 search/find，`assemble_context` 则把多类检索结果变成预算内上下文。本页仅静态核验，没有运行模型、向量服务或 LongMemEval。核心结论是：候选匹配、实际正文读取、渲染文本以及宿主提交给模型的 messages 是四个不同产物，不能用检索命中率代替最终使用正确率。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/service/search_service.py#L71-L115) [源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py#L85-L195)

例如当前问“Phoenix 用什么语言”，搜索阶段可以命中项目决策、用户偏好或事件。上下文阶段还要按用途和类别分配额度，排除指定 URI、考虑最近已读内容，再选择摘要、概览或正文。只有最后那段实际交给回答模型的输入，才能解释为什么模型回答 Python 还是 Rust。

## 查询、召回与排序

当前 `HierarchicalRetriever.retrieve` 绑定 `RequestContext` 构造 VikingDB 代理，按目标目录、scope、level 和查询类型检索；语义查询生成向量，THINKING 模式在有可用 reranker 时对候选重排，QUICK 使用向量分数。阈值口径有区分：默认 rerank 阈值不应误用于原始向量分数。配置未提供 reranker 时会回退为向量搜索。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/hierarchical_retriever.py#L74-L181)

SearchService 的意图开关决定是否需要结合 Session；上下文重排默认关闭，只有配置启用且 provider 可用才创建 reranker。关键词查询还要求配置的后端支持并启用全文索引，不能从 API 有 `keywords` 参数推断所有向量后端均可用。这里体现的是“接口接受能力”与“有效部署配置”之间的差别。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/service/search_service.py#L89-L139)

## 上下文预算为什么是独立流水线

`assemble_context` 先规范化 quotas 和 penalties，再在需要时加载会话。自动扩展可调用账号自己的 query planner；planner 不可用时有退回原始查询并标记失败的路径。随后读取 RecallLedger，形成跨轮冷却集合，规范化外部 exclude_uris，收集候选。在请求级 embedding cache 内，相同查询的并发查找共享向量化结果，避免按类别重复请求 embedding。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py#L85-L180)

候选出来之后，流水线只为需要正文层级的条目预取内容，再由 `plan_entries` 在 `max_tokens` 下做计划，最后 render；可选 rewrite/digest 是后续步骤。这意味着层级降级与淘汰发生在召回之后，某条命中完全可能因为预算没有进入最终文本。跨轮去重也有状态代价：过长冷却窗口可能让仍然重要的约束暂时不再出现，需要根据任务检验，而不是默认视作节省 token 的无损优化。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py#L147-L220)

## 更新、隔离和故障传播

文件修改经 updater 触发索引消息，删除经文件系统接口联动清索引；召回与实际读取之间仍可能发生并发删除。应把这种候选失效与“检索算法没有找到”分开排障。路径访问层同时实施账号路径映射和读取授权，向量查询代理带请求上下文；这些是静态隔离机制，本文没有证明所有网关身份配置或租户部署都正确。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/storage/viking_fs/_access.py#L170-L237) [源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/memory_updater.py#L1957-L2098)

当前代码提供 schema 合并、Working Memory 与训练/演化模块，但本轮不把存在这些目录直接解释成系统已自动完成可靠反思。纠正能力仍应按实际启用策略核验：更正来源、旧记忆失效、摘要与索引同步、宿主后续回答这几步都要观察。并发和重试尤其要保留 task_id、URI 与错误状态，避免把半完成任务当成“模型忘了”。

## 评测与成本如何记录

上游 `benchmark/longmemeval/openviking/run_eval.py` 使用同步 HTTP client，存在单次搜索上下文条数、重排数量与字符上限，以及模型 tokenizer 和字符估算回退。它证明仓库具备可读的评测执行路径，不代表本轮得到了其分数。改动 context limit、候选数量、使用多轮搜索或回答模型都可能改变结果。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/benchmark/longmemeval/openviking/run_eval.py#L1-L68)

成本应拆成写入提取、摘要、embedding、查询规划、召回、rerank、上下文改写和回答。建议同时量测“提交到任务完成”“任务完成到新事实可查”和“查询到最终回答”三段延迟。吞吐或 token 节约结论需要固定这些开关；本页没有给出未经运行的估计收益。

## 失败归因的最小记录

一次错误回答至少保留查询文本、作用域、原始候选、最终计划层级、渲染结果、宿主提交的 messages 与回答。若 Rust 文件已经存在而候选没有它，先查向量任务与过滤；若候选有它而渲染没有，检查配额和预算；若渲染有它而最终请求没有，应回到宿主集成。只有最终请求中存在正确、足量且不矛盾的依据，才能主要追问回答模型为何误用。

预算实验还应让同一查询在不同 max_tokens 下运行，并记录旧事实是否先被保留、新纠正是否被裁掉。这里没有预设层级压缩一定损害质量，只是指出“更少文本”必须与有效约束覆盖一起衡量。跨轮冷却也应包括连续两轮都需要相同项目约束的样本。

## 自测

1. 一条结果有很高向量分数，为何仍可能没有进入回答模型？
2. 如何区分查询规划失败、索引尚未生成和宿主没有注入上下文？
