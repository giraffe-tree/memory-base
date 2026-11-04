---
id: foundations.start.recall
title: 需要的时候，怎样把记忆找回来？
summary: 召回、排序与供给是不同环节；搜索分数和去重状态都需要按具体语义解读。
project: reme
minutes: 5
status: source_verified
prerequisites:
- foundations.start.context
- foundations.start.files
sources:
- reme/steps/index/search.py
- reme/steps/index/_tool_context.py
- reme/config/default.yaml
---

## 从问题到证据

你问“上次部署失败怎样处理的”。系统先用查询找候选，再过滤、排序和截取，返回片段与来源。Agent 可以继续读取原文，然后对照本次环境选择是否采用。

返回片段不是“已经相信这条事实”，更不是宿主必然把它传进最终回答模型。需要追踪实际工具结果和后续请求，才能确认记忆确实影响了这轮任务。

## 关键词与向量

关键词检索适合名称、术语和精确词；向量检索通过表示寻找语义相近内容。ReMe Search 支持两路结果，并在适用时通过 RRF 融合排序。默认配置只连接 BM25，向量存储为空；想观察双路融合，需要先配置对应后端与模型。

`SearchStep._rrf_merge` 按候选排名贡献分数，不是直接平均原始 BM25 与向量分数。RRF 值、关键词值和向量值也不能统一读成“正确率”。

## 少返回重复内容

同一工具上下文可以记录已返回的 chunk ID，默认 seen TTL 为24小时。这个状态通常属于应用生命周期内的工具上下文缓存，而不是“用户永久看过”的学习记录。

同一个查询第二次可能少返回内容，并不一定说明索引丢失了文件。排查时要检查 `tool_context_id`、去重统计和过期条件，再判断是无命中还是已返回过。内容更正后是否产生新 chunk 身份，也需要结合分块和更新逻辑核对。

## 边界

过滤结果需要结合路径、日期、标签与权限解释。标签索引未启用、不健康或查询中变为不健康时，会返回 `tag_filter.applied=false` 并继续普通检索；业务若把标签当权限，就会混淆检索辅助与授权边界。宿主仍需对工作区和调用者做恰当隔离。


## 源码定位

- [reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)
- [reme/steps/index/_tool_context.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/_tool_context.py)
- [reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)

## 自测

1. 同一查询第二次返回少了，除了“记忆丢失”还可能是什么原因？
2. 为什么排名第一的旧经验仍可能不适用于今天的任务？
