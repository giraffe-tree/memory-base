---
id: projects.hindsight.overview
title: Hindsight：三类操作怎样组成一个记忆服务？
summary: 沿 MemoryEngine、存储扩展与只读 reflect 划定服务边界，区分事实、归纳与回答的状态责任。
project: hindsight
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - hindsight-api-slim/hindsight_api/engine/memory_engine.py
  - hindsight-api-slim/hindsight_api/engine/memories/base.py
  - hindsight-api-slim/hindsight_api/engine/memories/postgres.py
  - hindsight-api-slim/hindsight_api/engine/retain/types.py
  - hindsight-api-slim/hindsight_api/extensions/builtin/tenant.py
  - hindsight-system-evals/README.md
---

## 结论与适用版本

Hindsight 当前是围绕 `MemoryEngine` 编排的记忆服务：`retain` 把资料变成可检索事实，`recall` 返回经过融合与排序的证据，`reflect` 用工具循环读取记忆并回答。**reflect 不是每次回答都自动改写长期记忆的反思任务**；其入口明确为只读，长期归纳由 consolidation、observation 与 mental model 刷新承担。本页固定 2026-11-07 的源码，只核验程序路径，没有启动服务或模型。[MemoryEngine 与 reflect](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L16048)

## 先跟一个跨会话例子

第一次提交“alpha 项目改用 Rust，原因是交付二进制”。宿主选择 bank、来源文档 ID、时间和标签，调用 retain。模型决定怎样拆出事实及实体；程序生成 embedding、解析关系并持久化。第二次问“alpha 怎么交付”，宿主可直接 recall，自己把证据加入主模型请求；也可 reflect，让服务里的回答模型调用 recall、lookup、expand 等只读工具，逐步取得证据。两个接法的回答模型归属不同，不能只比较一次 API 的耗时。

输入的文档、抽取事实、跨事实归纳、合成知识页是不同状态。`ExtractedFact` 包含事实类型、内容与 chunk 索引、事件时间、提及时间、实体、标签和附件归因；处理后的 `ProcessedFact` 再带向量、chunk/document 引用。它保存的不是一条对话的完整同义副本。抽取遗漏后，检索排序再好也无法凭空恢复该条事实；保留原文并在需要时 expand，才提供另一条核对路径。[事实模型](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/retain/types.py#L323)

## 谁运行、谁持有状态

| 层 | 当前实现的职责 | 宿主仍需承担 |
| --- | --- | --- |
| HTTP／MCP 与 SDK | 把请求路由到服务操作 | 何时记、当前用户身份、如何调用回答链 |
| MemoryEngine | 认证、配置解析、编排提取与检索、后台维护 | 业务允许保存哪些来源与内容 |
| MemoriesExtension | 事实与检索的存储边界 | 选定后端及其部署恢复策略 |
| 默认 PostgresMemories | SQL 事实、关联及检索各路实现 | 数据库、模型和工作进程运维 |

这里有一处容易被旧架构图掩盖的变化：检索入口已经调用单一 `recall_unified`，各路 SQL 和连接的编排属于 store。默认 Postgres 内部仍运行语义、关键词、时间和图检索，融合／rerank 留在 engine。因而“检索四路并行”不能机械解释成入口同时发送四个独立数据库请求，更不能推断每种可扩展 store 都采用同样查询计划。[默认存储边界](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memories/postgres.py#L126)



另外，engine 会先询问 store 的 `full_recall` 能否直接完成整个召回，包括融合、排序与预算；默认实现返回 None，默认 Postgres 继续走上述管线。其他 store 可对支持的请求直接回答，所以“engine 做重排”是本页默认后端的路径，不是扩展接口的永久限制。[整轮召回扩展](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/engine/memories/base.py#L1895)

## bank、租户和权限不能混为一谈

bank 是记忆组织与配置范围；tenant extension 认证后选择 schema，另有 operation validator 与标签范围控制。默认 `DefaultTenantExtension` 直接返回配置 schema，不要求认证。内置 API key 扩展验证一个配置密钥后也返回同一个 schema；若需要每租户独立 schema，要实现相应映射。**存在 bank_id 不等于调用者已经被授权访问该 bank**，部署应核对自己启用的 extension 和 validator。[默认与 API key 实现](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-api-slim/hindsight_api/extensions/builtin/tenant.py#L8)

配置也分层：全局默认、租户覆写、bank 覆写。模型、提取策略或召回能力改变后，既有文档不必然自动重提取；版本迁移、重新处理和维护队列是另一条生命周期。把服务当成一个永远不变的向量缓存，会遗漏这部分状态管理责任。

## 采用条件与可检验边界

设计上的收益是把多路检索、来源回看和跨事实整理集中在一个服务，适合多个 Agent 共用记忆、需要查看中间证据的系统。代价是写入模型、embedding、reranker、数据库与维护任务均需计量；reflect 又添加工具循环和回答调用。它的价值应由同语料、同模型预算下的任务收益决定，而不是组件数量。

仓库把 stub 驱动的 system-tests 与真实模型的 system-evals 分开：前者检验机制，后者用 judge 测质量，后者还涉及外部 benchmark。这里没有复跑任一组，也不把官方成绩当成本地结果。采用前至少验证事实更正、来源删除后归纳刷新、异步回执到可检索的时间，以及不同租户的边界。[评测分层](https://github.com/vectorize-io/hindsight/blob/0bd55015393d224deec1073d63b24bcc0faad164/hindsight-system-evals/README.md#L1)

研究中还要保留三个版本坐标：宿主 SDK 的请求契约、API 服务的实现版本、模型与存储配置。生成客户端能接受参数不代表旧服务已理解它，数据库迁移成功也不代表旧资料已按新提取方式更新。接入验收应固定这组组合，记录一条资料何时收到回执、何时可 recall、何时完成整理；只有三个时点都观察到，才有依据描述产品里的“已经记住”。

## 口述自测

1. recall 命中后，是哪个进程把内容放进最终回答？改用 reflect 后哪里发生变化？
2. 删除来源后，为什么还要检查 observations、知识页和后台维护，而不只数 memory units？
