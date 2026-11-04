---
id: projects.reme.cost-adoption
title: 记忆系统花费在哪里，什么条件下值得接入？
summary: 成本来自采集、整合、索引和供给全链路；当前参数只能说明控制方式，不能直接推导账单或收益。
project: reme
minutes: 8
status: source_verified
prerequisites: [projects.reme.updates-forgetting, projects.reme.evaluation-observability]
sources: [reme/config/default.yaml, reme/steps/evolve/dream/extract.py, reme/steps/evolve/dream/integrate.py, reme/schema/token_usage.py, reme/components/agent_wrapper/as_agent_wrapper.py, reme/utils/token_utils.py, tests/unit/test_token_usage.py]
---

## 结论：记忆把成本分散到多个时刻

ReMe 的成本不只发生在回答问题时。采集经历可能调用模型，Dream 需要提取和整合，启用向量后还有 embedding，检索结果进入模型上下文后继续产生输入成本。维护任务也会消耗 CPU、内存、I/O 与运行时间。

本页依据 `d323356e6f11` 的默认参数与统计契约。没有接入计费模型，也没有实测成本收益，因此不提供金额或节省百分比。采用条件是根据实现边界作出的工程判断。

## 沿一周协作拆成本

| 阶段 | 主要工作 | 应记录的量 |
| --- | --- | --- |
| 每次保存经历 | 解析输入、Agent 提炼、文件工具调用 | 输入输出 token、模型轮次、失败重试、耗时 |
| 定期 Dream | 批量提取、逐单元召回与编辑 | 材料大小、批次数、单元数、工具轮次、延后与重试 |
| 索引更新 | 分块、关键词索引、可选 embedding 和链接图更新 | 变化文件、分块量、向量调用、索引容量、可见性延迟 |
| 新任务读取 | 查询、排序、过滤及结果供给 | 查询延迟、返回字数、实际进入上下文的 token |
| 运维与恢复 | 持久化、扫描、重建、备份 | 峰值内存、磁盘、恢复耗时与失败次数 |

例如反复记录同一项目讨论，不能只对比最后一次回答的短上下文；此前的提取和整理开销也需摊入这一周的总成本。反过来，长期复用一份稳定经验可能摊薄维护成本，但是否抵消仍需相同任务的有记忆、无记忆基线来判断。

## 默认参数能控制什么

当前 file store 默认启用 BM25，embedding 相关组件被注释，`embedding_store` 为空。默认部署因此不能直接按“每次必做向量化”估算。开启可选向量后，需要同时核对模型、维度、缓存、变化检测与重建行为。

Dream 默认扫描两天、最多提取五个单元，每批材料预算为 `40000`。`DreamExtractStep` 的注释明确：这里按文件字节估算，不含提示词开销；单个超大文件仍会独占一次请求。因此它是分批控制，不是 token 上限或账单硬限额。提取回执无效会有一次重试，传输失败可二分批次隔离坏输入；整合每个单元也可能重试。限制单元数减少后续工作，同时可能把材料延后，不能仅看调用数下降而忽略覆盖率。

默认 AgentScope wrapper 的 `max_iters: 30` 是 Agent 循环配置，模型适配器还有独立重试设置。一次 Job、一次 Agent 调用和一次底层模型请求不是同一计数单位；上限叠加也不能直接当作实际请求量。

## token 统计的实际口径

`TokenUsage` 仅保留提供商报告的顶层输入、输出计数，`total_tokens` 始终是两者之和。缓存命中、reasoning 等细分不纳入统一字段，各供应商的账单含义仍可能不同。

`AsAgentWrapper.reply` 从最终消息取得聚合 usage；需要额外结构化输出调用时会合并 usage。若供应商未返回，结果标记为不可用并记录日志，而非把缺失解释成零消耗。上游测试还明确检查当前流式 reply 路径不累计同样的 token 计数。进程内累计值也不等于可对账的长期账单。

`estimate_token_count` 另按编码字节数除以估算因子，它适合粗略预算，不替代模型 tokenizer 或账单。成本比较应保留原始供应商 usage 与请求记录，再按具体计费规则计算。

## 第一版的采用条件

若目标是个人或项目持续协作，需要能人工检查与更正的文件、可追踪来源以及可重建索引，ReMe 的结构值得试用。应先完成真实宿主的保存与检索接线，验证跨会话确实使用了记忆，并在合成变更场景中检查旧事实处理。

若要求共享网络服务、严格事实撤销、跨进程并发写入或明确的端到端低延迟保证，则当前研究证据不足以直接认定满足。下一步应针对这些条件测量和补齐，而不是通过一次演示或默认配置得出生产采用结论。

## 源码定位

- [默认组件、模型和循环参数](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [分批预算与失败拆分：DreamExtractStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/extract.py)
- [单元整合与重试：DreamIntegrateStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [统一 token 契约：TokenUsage](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/token_usage.py)
- [AgentScope 统计入口](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py) · [统计边界测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_token_usage.py)

## 自测

1. `max_chars_per_batch=40000` 为什么不能保证一次请求少于一万个 token？
2. 若最终回答 token 减少了，评估记忆方案收益还必须加上哪些成本？
