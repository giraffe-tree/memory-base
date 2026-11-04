---
id: foundations.start.reme
title: ReMe 在整个系统里做什么？
summary: ReMe 管理工作区中的经历与知识，宿主仍需把记录和使用接进自己的生命周期。
project: reme
minutes: 5
status: source_verified
prerequisites:
- foundations.start.memory
sources:
- reme/application.py
- reme/config/default.yaml
- reme/schema/application_config.py
---

## 先把它放回协作链

ReMe 是一套本地优先、以文件为中心的记忆系统。宿主把会话或资料交给它；它提供整理、文件操作、检索和维护任务。调用者可以通过 Python 应用、HTTP 或 MCP 使用这些能力，具体路径由部署方式决定。

安装库并不自动接好每个 Agent 的生命周期。宿主必须决定什么时候提交会话、选择什么工作区、何时查询记忆，以及如何把结果加入实际模型输入。

## 三条主线

**写入**：`auto_memory` 处理对话，记忆 Agent 使用工具创建或更新 daily，并连接到来源会话。**找回**：`search` 查询索引，返回片段、来源和分数；Agent 可以继续读取原文。**整理**：Dream 扫描变化的 daily，提取知识单元，检索已有 digest，执行整合并提交处理水位。

`Application` 负责把配置变成组件和 Jobs，按依赖顺序启动，并在关闭时收回资源。Job 中的 Steps 共用请求上下文；组件与应用状态则有更长的生命周期。

## 一个贯穿手册的例子

今天记录“压测前暂用 SQLite”；晚上从经历中整理数据库决策；几天后讨论部署时检索这条决定。这是一个用来讲机制的合成故事，不是本轮已运行的端到端演示。

## 当前基线

研究固定到 `d323356e6f11`。默认配置启用关键词 BM25 和 tag 索引，`file_store.default.embedding_store` 为空。源码支持可配置向量存储，不表示默认查询已经执行向量检索。

默认 Dream 定时配置为 `0 23 * * *`，时区配置默认为 Asia/Shanghai；实际部署覆盖、启动状态与调度成功仍需另行检查。


## 源码定位

- [reme/application.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)
- [reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [reme/schema/application_config.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/application_config.py)

## 自测

1. 哪些事情由 ReMe 负责，哪些事情仍属于宿主？
2. “支持向量检索”和“默认正在使用向量检索”分别需要什么证据？
