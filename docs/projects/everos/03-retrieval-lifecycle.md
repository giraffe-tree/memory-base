---
id: projects.everos.retrieval-lifecycle
title: EverOS 的检索、反思和删除怎样沿来源传播？
summary: 按owner与记忆类型选择检索流水线；反思先建立新Episode及其事实，再废弃原项；会话删除清来源及指定daily-log类型，综合画像与技能不自动重写。
project: everos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/everos/memory/search/manager.py
  - src/everos/memory/search/adapter.py
  - src/everos/memory/reflection/orchestrator.py
  - src/everos/service/memory/_delete.py
  - src/everos/infra/persistence/markdown/stores.py
  - src/everos/infra/cascade/reconciler.py
  - benchmarks/reproduce.sh
---

## 检索并非四个同质开关

固定 `80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9` 的 SearchManager 是 `/api/v2/memory/search` 的领域编排器，它不负责最终聊天模型回答。用户查询与 Agent 查询在 owner_type 上硬分区；用户主要得到 Episode，可带 Profile，Agent 则得到案例和技能。返回的来源路径、相关分数与条目内容，仍需宿主选择并放进自己的模型上下文。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/manager.py#L1-L29)

以“上次迁移为什么改成 Rust”为例，Episode 是经历，AtomicFact 是更细的事实，Profile 是用户画像，AgentCase 是可复用案例。这些不是同一粒度。查询如果选错 owner_type，可能没有搜索到所需轨道；这与向量模型效果差是不同问题，应该先检查请求的 app/project/owner 与类型。

`resolve_pipeline` 对 KEYWORD/VECTOR 跳过融合，对 HYBRID 的 episode/atomic_fact 选择 hierarchy，对 agent_case 选择 vector_anchored，对 agent_skill 则选择专门的 skill_hybrid；AGENTIC 在到达该函数前由管理器拦截。当前 hierarchy 的代码说明是 RRF 排序扩展、校准分数和全局 top-N 竞争，并不是所有路径都做 LLM rerank。算法中调用 everalgo 的部分内部不在本次源码覆盖范围。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/adapter.py#L1-L52)

## 分数和上下文如何解释

SearchManager 默认把 HYBRID 与 AGENTIC 视作经过校准的分数，KEYWORD 的 BM25 和单路 VECTOR 采用不同观测口径；Profile 又没有查询相关分数。把所有项目的 score 混在一个阈值下会制造虚假的“召回命中”。上游也限制无限 top_k 的候选池，尤其案例和技能正文较重，其默认上限比 Episode 小。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/manager.py#L101-L160)

因此应用应分别记录检索方法、最终条目、读取的 Markdown 版本、上下文 token 和回答结果。高分检索不代表事实仍然有效；索引命中也不代表宿主已经把来源和失效标记一并交给模型。本文没有端到端回答验证，不能宣称这套分层已降低幻觉。

## 反思如何避免先删旧再等新

ReflectionOrchestrator 选择可合并集群，调用 reflector，将合并 Episode 写入 Markdown，并发出携带 ReflectionContext 的 EpisodeExtracted。随后事实提取产生 AtomicFactsExtracted，ReflectionFinisher 才废弃被替代的 Episode 和事实、更新集群并写报告。若新 Episode 的事实一直未成功，旧条目保持 live，新合并项成为后续需要处理的孤儿。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/reflection/orchestrator.py#L1-L21)

这个顺序表达的是“先让替代物形成，再失效原项”。它不等同于所有内容都自动压成无冲突的永久结论，也不等同于删除原文。废弃标记还需 Cascade 传播到检索投影；在传播期间，来源、状态与重复项如何显示需要实际测试。反思的模型质量、聚类稳定性和调用成本本轮均未测量。

## 删除怎样与后台写入协作

Deleter 支持 session、owner、owner+session 和按 Episode ID 等范围。完整会话删除会先拒绝仍有 queued work 或长时间占用锁的 session；获得会话锁后，先清除来源 MemCell、buffer 和状态，再清相应记忆及索引。具体 _remove_session 对 user 只删除 Episode、AtomicFact、Foresight，对 agent 只删除 AgentCase，不自动重写综合 Profile 与 Skill。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_delete.py#L1-L25) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L83-L159)

来源先消失与daily-log追加/废弃时的 only_if 协作，只能说明采用此契约的路径避免晚到写入；Profile 和 Skill 的 write 持有 owner 锁，但没有同样的来源检查参数。会话删除与删除整个 owner 的目录也是不同操作，后者才明确清对应画像或技能索引。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_delete.py#L183-L216) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L492-L509) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L588-L609)

源码明确把部分删除后的失败当作 incomplete，要求相同请求完成余下步骤；索引删除失败由后续 Cascade 追赶。这是面向可恢复流程的设计，不是跨三层原子回滚。用户只删某个 owner 的条目时来源对话可以保留，所以“删除结果”必须声明作用域。手工删文件后的孤儿索引，则由扫描对账补发 deleted；未改 mtime 的不可重试失败不会自动重做。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_delete.py#L1-L25) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/cascade/reconciler.py#L111-L140)

## 评测实现与采用成本

`benchmarks/reproduce.sh` 把 add/search/answer/judge 分阶段运行，模型、top_k、检索开关和并发从 dataset TOML 读取，并区分全量数据与切片结果目录。脚本检查环境变量和数据路径，说明复现需要固定回答模型与评分模型。这里没有运行该脚本，也没有把 README 成绩转成当前部署的验收结果。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/benchmarks/reproduce.sh#L1-L24) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/benchmarks/reproduce.sh#L49-L77)

成本应包含边界检测、Episode、事实与画像/案例/技能生成、聚类反思、embedding、检索和回答。先测一段连续协作经历被拆成多少 Cell、产生多少派生项，再测纠正和删除收敛时间，比先比较裸向量查询延迟更能揭示采用代价。

## 如何测试来源删除后的收敛

先用一个 session 写入两位参与者的经历，再分别测试只删其中一个 owner、删该 owner 在此 session 的条目、以及删除整个 session。三个样本应保留不同预期：有的只移除一份用户视角，有的还保留供其他参与者使用的来源，有的需要通过来源检查阻断daily-log后续追加。还需单独检查Profile与Skill是否仍包含由该session综合而来的信息，不能用一次“查不到 Episode”代替所有删除范围的验收。

再把删除放在反思新 Episode 已写、事实尚未完成的时刻，观察旧来源与新合并内容是否收敛到一致状态；重启 Cascade 后重复查询，排查索引残留。这个样本直接检验来源检查和先替代后废弃的协作，比只调用正常删除接口更有区分度。本文没有执行这些步骤，因此保留为下一轮运行验证任务。

## 自测

1. 为什么反思成功写了新 Episode，旧 Episode 还可能保持有效？
2. 删除一个用户的某段记忆与删除整段来源会话，会影响哪些不同状态？
