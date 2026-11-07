---
id: projects.everos.overview
title: EverOS 如何用 Markdown 真相层连接用户记忆与 Agent 经验？
summary: 当前EverOS由SQLite经历账本、Markdown记忆真相和LanceDB派生检索组成；服务编排可读，但多项算法属于独立everalgo依赖。
project: everos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/everos/service/memory/_memorize.py
  - src/everos/memory/extract/pipeline/user_memory.py
  - src/everos/memory/extract/pipeline/agent_memory.py
  - src/everos/infra/persistence/markdown/stores.py
  - src/everos/memory/search/manager.py
  - pyproject.toml
---

## 先确定当前实现

本次研究对象是 `EverMind-AI/EverOS` 的 `80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9`，核验日期为 2026-11-07。源码主包为 `src/everos`。旧 EverMemOS 地址的重定向不意味着早期 MongoDB、Elasticsearch 等实现可以直接作为此版本的架构证据；本页只描述已读的当前路径，没有启动服务、安装依赖或运行真实模型。

当前设计把三类持久对象分开：SQLite 保存会话缓冲、MemCell 与调度状态；Markdown 保存提取后的记忆内容；LanceDB 支持面向检索的投影。Markdown store 明确承担 truth port，返回包含 entry_id 和相对 md_path 的 `MemoryRef`，搜索管理器则只读 LanceDB 与 Markdown。这里的“文件是真相”专指提取记忆，不能扩大成所有原始消息和运行任务都只在 Markdown。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L1-L7) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/manager.py#L1-L29)

## 相同经历怎样产生两条记忆轨道

输入“Phoenix 从 Python 改成 Rust，这次迁移踩到了依赖兼容问题”后，`Memorizer.run` 先做 ingest 和边界切分，把消息整理成 MemCell。用户轨道从用户角度形成 Episode；agent 模式另外发布 AgentPipelineStarted，供后续策略提取案例。它不是同一段文字简单打两个标签，而是同一来源单元为不同下游处理提供稳定身份。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py#L1-L16)

用户 pipeline 对一个 Cell 只先提取一次 Episode，再按不同用户 sender 写入各自作用域；写成功才返回 EpisodeExtracted 事件。Agent pipeline 本身不写 Markdown，也不写新的 MemCell，它只发事件，把 AgentCase 的生成留给策略。这一点可以避免误把“AgentPipeline.run_cell 返回”解释为“案例与技能都已经保存”。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/extract/pipeline/user_memory.py#L59-L115) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/extract/pipeline/agent_memory.py#L1-L38)

## 工程边界在哪里

服务 use case 负责请求、锁、持久化边界和事件发布；memory domain 面向 store/index 等端口；infra 提供文件、SQLite、LanceDB 等适配。这个分层使“模型产生领域结果”与“结果写成什么文件、怎样被搜索”可以分别替换。宿主既可以通过 HTTP 请求，也可以把服务对象嵌入进程；真正的模型请求由配置的 provider 承担，不能把整个链路统称为 MCP 调用。

一个重要的源码覆盖边界是 `everalgo`。依赖声明锁定 user-memory、agent-memory、rank、knowledge、boundary、core、clustering，以及可选 parser 等独立分发包。当前仓库可以跟到 EpisodeExtractor 调用、输入映射、输出写入和事件传播，但其抽取算法内部与部分排序内部不在本次 Git 树。没有下载依赖源码，就不能宣称“已拆完所有算法”，也不能把算法包已发布等同于本轮已核验其许可和完整实现。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/pyproject.toml#L93-L112)

## 检索与维护的设计含义

SearchManager 按 owner_type 硬分区：user 主要查 Episode，可附带 Profile；agent 查案例和技能。KEYWORD、VECTOR、HYBRID、AGENTIC 并不只是同一个搜索换四个参数；不同类型会走 hierarchy、vector-anchored 或 skill hybrid。Profile 还可能是键值获取，不能和有查询相关分数的 Episode 直接并排计算平均相似度。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/search/manager.py#L1-L29)

这适合需要用户拥有可编辑记忆、保留经历到派生记忆的映射，同时希望区分“关于用户的事实”和“Agent 做事的经验”的系统。成本是文件和索引最终一致、边界检测及多条策略可能触发多个模型步骤，并且需要理解源数据删除和派生内容失效的关系。可读文件有助于审计，不会自动解决来源真实性或记忆语义冲突。

## 采用前需要核验什么

本文的采用判断来自结构，而非运行分数。至少应验证：手工编辑 Markdown 后检索何时变化、重建索引后结果是否一致、跨 app/project/owner 是否串数据、同一来源删除后是否仍能生成新派生记忆，以及恢复任务是否重复抽取。若只需要简单偏好条目，当前多轨道和后台链路可能超过需求；若需要本地审计、迁移和经验沉淀，这些分层才可能带来实际价值。

## 从文件可读到数据可迁移

可编辑 Markdown 是审计入口，但迁移时至少还要明确三种对象的去向：原始会话与 MemCell、提取后的各类记忆、后台工作的持久状态。只复制 Markdown 可以迁移可见知识，却不能直接推出新实例保留了全部原始来源和未完成任务；只复制 LanceDB 则会把派生索引当作唯一依据，丢失文件修改和重建的设计价值。

这个区别影响个人记忆系统的备份方案。建议先完整备份实际 memory root 与相关 SQLite 状态，再在空白索引上做重建对照；比较记忆条目、来源身份和可查询性，而不只比较文件数量。若依赖外部算法版本，也应把依赖锁和模型配置一并保存，否则相同原文重新抽取可能得到不同结果。这些是架构推导出的验收要求，本轮尚未运行。

## 自测

1. 为什么“Markdown 是真相层”不能理解为删除 SQLite 不会丢失任何东西？
2. Agent pipeline 没有直接写案例，那么案例产生的完成点应该向哪里继续追踪？
