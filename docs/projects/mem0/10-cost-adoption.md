---
id: projects.mem0.cost-adoption
title: 一次提取调用之外还有哪些成本，何时适合采用？
summary: ADD-only 减少自动决策阶段，但向量化、实体检索、存储和宿主供给仍需计算，采用条件应落到真实工作负载。
project: mem0
minutes: 8
status: source_verified
prerequisites: [projects.mem0.write-path, projects.mem0.evaluation-observability]
sources: [mem0/memory/main.py, mem0/embeddings/openai.py, mem0/llms/openai.py, mem0/utils/entity_extraction.py, mem0/utils/spacy_models.py, mem0/configs/base.py, server/main.py, README.md]
---

## 结论：一次 LLM 提取不等于一次网络请求

当前默认推断链使用一次 LLM 生成新增事实，省去了每条旧记录再做一次自动 CRUD 判断的流程。然而此前会向量化对话并召回旧记忆，此后还要向量化新事实、抽取并向量化实体、写入多个存储。回答阶段仍由宿主与其模型产生费用。

本页依据 `ed1f10fc8708` 分析调用结构，不提供未测量的金额、延迟或节省比例。采用条件是由代码边界推导的工程判断，不是本项目的生产验收结论。

## 把一周成本按阶段记下来

| 阶段 | 当前实现会做的工作 | 建议测量 |
| --- | --- | --- |
| 新增前准备 | 消息解析、对话 embedding、相似旧记录与近期消息读取 | 请求数、文本量、provider 延迟 |
| 提取与新增 | LLM 提取、事实 batch embedding、hash 去重、向量插入、历史写入 | 模型 usage、事实数量、失败降级、部分成功 |
| 实体维护 | 本地 NLP、实体 embedding、实体查询和关联更新 | CPU、内存、模型加载、向量请求与实体数量 |
| 查询 | query embedding、semantic/BM25、实体加权、可选 rerank | 候选数、耗时、请求数、返回 token |
| 宿主使用 | 选择结果、组装上下文、调用回答模型 | 实际供给量、回答质量与完整任务成本 |

记录了十次对话后，只比较最后一轮回答的输入 token，会漏掉前九次采集与更新成本。反过来，稳定事实被反复复用可能摊薄前期成本，但需要在同样题目与预算下对照无记忆基线。

## 默认路径的具体成本边界

`_add_to_vector_store` 会先读取十条近期消息，再将当前对话 embedding 后检索十条相关记录，随后才进行提取。LLM 输入由旧候选、近期消息、新消息和自定义指令共同组成，单次提取并不保证提示词很短。

事实 embedding 优先批量，失败时逐条回退。OpenAI embedding 适配器把批次切成最多一百条，实际远程调用次数随数据量变化；记录数、batch 数与 provider 请求数不是同一指标。实体关联还有独立 embedding 和查重工作。

`infer=False` 跳过 LLM 提取，但仍逐条 embedding 并创建记忆，不走相同的推断去重流程。它适合调用方已经准备好内容的情况，不能理解为零成本或通用幂等写入开关。显式 metadata 更新在当前路径中也可能重新生成正文 embedding，应按实际调用记录核对。

## 检索成本随后端与 NLP 环境变化

OSS 默认查询返回上限为二十，内部语义候选池取 `max(top_k * 4, 60)`；关键词结果提供 BM25 信号，实体查询还能附加向量化和多次查找。配置 `rerank=True` 且存在 reranker 时会增加相应工作，默认不启用。

实体提取与词形处理依赖 spaCy。当前加载器使用英文 `en_core_web_sm`，首次缺模型时可能尝试下载；加载失败后会缓存失败并降级。中文命中、冷启动和离线部署必须单独验证，不能把英文 NLP 的存在视为中文效果保证。

同样，vector store 适配器不一定实现关键词检索。即使配置接口相同，实际信号数量、索引体积与远端请求也可能不同。比较时必须列明后端与降级状态。

## 账单和部署形态分开核对

所读 OpenAI LLM 适配器返回解析后的正文或工具结构；embedding 适配器返回向量，主 Memory 返回结果列表。这里没有形成像账单一样覆盖所有 provider 调用的统一 token 台账。应从网关或 provider 原始 usage 另行采集，避免把缺少统计误记为零。

Python OSS 可以选择本地或远端 provider，但在当前 OpenAI 适配器默认值下，模型与 embedding 需要相应服务和凭据。自托管 REST 另有数据库、认证、日志与运行资源开销；托管平台的套餐和服务端优化又是另一组条件，不能只凭 SDK 名称判断成本。

## 第一版采用判断

如果需要把提取与检索作为库嵌进已有应用，并愿意由宿主管理身份、上下文供给与业务更新语义，Mem0 OSS 值得进入小规模试验。优先用真实语言和合成项目变更样本，检查 ADD-only 的历史积累是否符合产品预期。

如果要求严格删除所有副本、跨库原子提交或不互信租户共享服务，则当前实现证据不足以直接承诺满足。应先验证历史保留策略、实体修复、归属授权和失败补偿。README 托管效果也不能替代这些具体条件的本地验收。

## 源码定位

- [新增、检索候选池、显式更新与 rerank](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)。
- [OpenAI embedding 分批与返回内容](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/embeddings/openai.py) · [LLM 响应解析](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/llms/openai.py)。
- [实体抽取](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/entity_extraction.py) · [NLP 加载与失败降级](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/spacy_models.py)。
- [自托管 REST 默认 provider 配置](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/main.py)。

## 自测

1. 自动提取只调用一次 LLM，为什么仍会产生多次 embedding 和数据库请求？
2. `infer=False`、本地部署和没有 usage 字段，分别为什么都不能等同于零成本？
