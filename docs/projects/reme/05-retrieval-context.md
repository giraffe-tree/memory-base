---
id: projects.reme.retrieval-context
title: 搜索结果怎样成为下一次调用可用的上下文？
summary: 追踪默认 BM25、可选向量与 RRF、过滤、会话去重和来源返回的完整边界。
project: reme
minutes: 10
status: source_verified
prerequisites: [projects.reme.storage-index]
sources:
  - reme/steps/index/search.py
  - reme/steps/index/_tool_context.py
  - reme/components/file_store/local_file_store.py
  - reme/config/default.yaml
  - reme/components/agent_wrapper/as_agent_wrapper.py
  - tests/unit/test_search_step.py
  - tests/unit/test_search_score_threshold.py
  - tests/unit/test_search_empty_response.py
---

## 找回之后还需要宿主使用

`SearchStep` 接收显式查询，调用 store 的关键词与可选向量检索，过滤、排序、去重后返回带来源的片段。该 Job 不负责自动重写每个外部宿主的系统提示。宿主或 Agent 必须真正消费工具结果，才能让记忆影响随后回答。

本篇在 2026-11-04 对 commit `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9` 做源码核验。示例分数只用于解释算法尺度；没有开展真实模型的检索质量或回答效果评测。

## 从“上次选了什么语言”开始

调用方发送 query，例如“alpha 项目语言选型”，可附路径范围、日期或标签。代码要求非空查询；默认结果数是 5，可由 `REME_SEARCH_LIMIT` 调整。候选数按结果数乘默认 5 倍计算，并限制最多 200。

检索流程可概括为：

```text
query + filters
  → 规范日期 / 解析标签
  → store.vector_search 与 store.keyword_search
  → 两路都命中则 RRF，否则保留单路原分数
  → min_score → tool_context 去重 → limit
  → 展开文件链接 → 返回文本片段与结构化 metadata
```

默认配置的 embedding store 为空，所以向量分支没有有效向量结果，主要依赖 BM25。代码支持混合检索，不代表当前默认运行已经支付 embedding 成本，也不代表它默认具备语义相似查询的全部效果。

## 排序分数为什么不能当置信度

两路都有结果时，`_rrf_merge` 按 chunk ID 合并排名。向量分支贡献为 `vector_weight / (60 + rank)`，关键词分支贡献为 `(1-vector_weight) / (60 + rank)`；权重默认 0.7，可被输入调整并裁剪到 0–1。

若同一片段在两路都排第一，总分是 `1/61`，约 0.0164。若只有单路有命中，代码直接保留该分支的原始分数，不做同样的 RRF 归一。因此拿单路向量阈值 0.5 套到混合结果，会把所有混合候选过滤掉。上游专门测试了这种尺度差异，并对超过混合上限的阈值发出诊断日志。

分数只表达该检索机制里的排序信号。它不代表事实正确概率，也不能用来判断“Rust 是当前方案”的可信程度；仍需读到来源中的时间、语境与后续更正。

## 过滤发生在哪里

LocalFileStore 支持精确路径、路径前缀、日期与 chunk metadata 条件。关键词检索在存在过滤条件时先计算 eligible chunk ID，再交给支持过滤的关键词索引检索，避免先截断全局 top-k 再过滤而漏掉范围内结果；第三方索引有兼容路径。

日期来自路径中的日期，默认不会仅因某文件没有日期就排除它；启用严格日期过滤才会排除无可解析日期的内容。无效日期在 SearchStep 中可能被记录警告后忽略，因此调用方不能把任意日期字符串当成强制过滤保证。

标签通过文件节点的标签索引解析成允许路径，再并入普通过滤。如果标签索引不可用，代码返回 `tag_filter.applied=false` 等状态，并可能继续普通检索。将标签用于功能筛选时要检查返回 metadata；它不能被直接当作租户授权边界。

## 去重是在“这一段工具上下文”内发生

传入 `tool_context_id` 后，已返回 chunk ID 被记录到应用内的工具上下文状态，默认 TTL 为 24 小时。下一次同一上下文查询跳过这些片段，减少重复材料占用；不传 ID 则没有这层跨调用去重。它不是持久学习记录，也不是用户已经读懂的证明。

chunk ID 由路径、行范围与文本构成，因此正文变化可能使片段重新可见。若所有候选都已经返回，响应 metadata 的空结果原因是 `all_returned`，区别于没有找到候选的 `no_results`。排障时不应把两者都解释成“数据库里没有记忆”。

## 返回材料如何抵达模型

文本结果包含路径、起止行、分数和片段，并可附入链、出链信息；结构化 `results` 不携带 embedding。AgentScope 工具桥接把 `Response.answer` 转为工具文本，外部 SDK 则可自行读取 metadata。宿主可以再调用 read 检查原文并决定预算。

研究验收应分别观察：检索是否返回正确来源、正确内容是否进入实际模型输入、最终回答是否遵守最新约束。只检查搜索命中，无法证明完整记忆协作已经生效。

## 源码定位

- [SearchStep 全流程](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)：`execute`、`_rrf_merge`、`_dedupe_tool_context`。
- [store 过滤检索](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py)：`keyword_search`、`_prepare_search_filter`。
- [分数尺度测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_search_score_threshold.py)与[空结果语义测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_search_empty_response.py)。

## 自测

同一个 `min_score` 为什么不能直接用于 BM25、向量与 RRF？一次搜索返回空列表时，怎样区分没有候选、被阈值过滤以及候选都已返回？
