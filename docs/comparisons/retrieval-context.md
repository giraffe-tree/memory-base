---
id: comparisons.retrieval-context
title: 同一个查询，为什么两边候选和分数会不同？
summary: 对照 ReMe 的两路RRF与Mem0的语义候选加分，明确门控顺序、去重状态及模型供给责任。
project: comparison
projects:
- reme
- mem0
minutes: 11
status: source_verified
prerequisites:
- projects.reme.retrieval-context
- projects.mem0.retrieval-context
sources:
- project: reme
  path: reme/steps/index/search.py
- project: reme
  path: reme/config/default.yaml
- project: reme
  path: reme/steps/index/_tool_context.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/utils/scoring.py
- project: mem0
  path: mem0/vector_stores/base.py
---

## 先比较候选来自哪里

两边都能出现关键词和向量信号，但当前组合方式不同。ReMe默认BM25；配置向量后，两路都有结果时按chunk ID合并候选，并用RRF融合排名。Mem0当前OSS先从semantic_results生成候选，BM25与entity信号为这些候选加分，不会单凭keyword命中新增候选。

固定基线为ReMe `d323356e6f11`、Mem0 `ed1f10fc8708`。源码结论与本轮合成信号局部实验分开；没有做实际两项目检索质量或中文效果比较。

## 相同任务，配置必须写清楚

输入“alpha项目现在用什么语言”，明确scope与语料时间。ReMe设置对应workspace与路径／日期过滤；Mem0当前search使用 `filters={"user_id":"..."}` 等scope标识，拒绝顶层同名参数。user_id过滤不是登录授权，工作区范围也不是用户认证，两边都要额外定义真实调用者与业务数据归属。

默认结果数也不同：ReMe默认5，Mem0当前top_k默认20。若比较召回，需要显式统一返回预算、语料、模型和后端能力，不能沿默认值直接比较命中数量。

## 分数处理的差异

| 阶段 | ReMe | Mem0当前Python OSS |
| --- | --- | --- |
| 候选生成 | 关键词与可选向量；双路有结果时按ID合并 | semantic搜索超取 `max(top_k*4,60)`，再构造候选 |
| 关键词信号 | BM25分支自身候选与排名 | 后端keyword_search可选；对语义候选提供归一BM25加分 |
| 实体信号 | 文档链接展开等机制不等于Mem0实体boost | 实体collection关联memory ID后提供boost，依赖NLP与后端 |
| 融合方式 | 双路RRF用排名；单路保留原分数 | `(semantic+bm25+entity)/max_possible`，分母按活跃信号变化 |
| 阈值顺序 | 排序／融合后按min_score过滤 | threshold先过滤原始semantic分数，再做加分 |
| 重复返回 | 可选tool_context_id与24小时默认seen TTL | 所读OSS search主线未见等同的跨调用已返回抑制 |

ReMe双路都排第一时RRF总分约为 `1/61=0.0164`，不是0.9级相似度。Mem0有三类信号时分母可为2.5；只有语义时为1。两个数都不是事实准确率，也不能把同一阈值在两边直接复制。

## 局部实验说明了什么

本轮直接执行未修改的Mem0 `score_and_rank`，给定合成向量／关键词／实体分数，验证了以下行为：

- semantic为0.09、threshold为0.1时，即使BM25为1、entity为0.5仍被排除。
- 仅关键词命中的ID不会被补入语义候选。
- semantic=0.8、BM25=0.6、entity=0.5时，归一总分为0.76。
- 语义候选只有a=0.8，BM25映射只有不在候选中的other时，a最终变成0.4；活跃信号映射改变了全局分母。

这些是排序函数的实际执行结果，不是真实后端返回分数，更不意味着0.76对应76%正确。输入、环境、17个局部样本及边界见 [Mem0局部实验](../../experiments/mem0-local-boundaries/README.md)。本轮没有执行ReMe RRF；其比较来自固定源码。

## 查询为空，排障方向也不同

ReMe应区分没有候选、阈值截断和同一tool_context中全部已返回。Mem0应检查scope、语义门控、过期隐藏、候选上限、后端keyword支持和NLP实体是否可用。只见“空results”不足以判断系统忘记了内容。

Mem0同步搜索主体按semantic、keyword、entity顺序调用，不应根据“三信号”写成三路全并行。异步路径也需要沿实际await和线程适配核验，API名字不能代替执行拓扑证据。

## 最后一步都属于宿主

ReMe可能返回带路径行号的片段，Mem0返回事实payload及可选score_details。宿主要选择、阅读或组合这些材料，放入实际模型请求，再观察最终回答。统一验收应同时保留候选列表、排序解释、供给内容和回答；只测搜索命中不等于记忆协作已经成功。


## 源码定位

- [reme · reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)
- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [reme · reme/steps/index/_tool_context.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/_tool_context.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/utils/scoring.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)
- [mem0 · mem0/vector_stores/base.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/vector_stores/base.py)

## 自测

1. 为什么高关键词分不能挽救Mem0中低于semantic门槛的候选？
2. 为什么ReMe第二次查不到已返回chunk，不能直接与Mem0的重复查询结果数比较？
