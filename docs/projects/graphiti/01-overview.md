---
id: projects.graphiti.overview
title: Graphiti：把事件变成时间关系图，边界在哪里？
summary: 从 Graphiti 对象追踪事件、实体、事实边及检索，区分时序图能力、模型判断与宿主权限。
project: graphiti
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - graphiti_core/graphiti.py
  - graphiti_core/nodes.py
  - graphiti_core/edges.py
  - graphiti_core/decorators.py
  - tests/evals/eval_e2e_graph_building.py
---

## 结论与研究范围

Graphiti 的中心对象是带来源与时间的关系图。应用提交 episode，库提取并归一实体，生成带事实文本的 entity edge；新材料可给旧关系增加来源，也可使矛盾关系失效。它首先是进程内异步 Python 库，REST 与 MCP 是额外服务表面；**图中命中一个事实与完整 Agent 完成任务是不同结果**。本页固定 2026-11-07 获取的基线，不把 Graphiti core 的实现等同于 Zep 托管后端，也没有运行模型或图数据库。

## 一个负责人变更怎样进入系统

11 月用户说“alpha 项目负责人是小王”，12 月说“改由小李负责”。宿主分别提供 episode 内容、来源、`reference_time` 和 `group_id`。`add_episode` 先找同组的前序事件，抽取实体，再通过旧图候选解析实体是否已经存在；随后提取关系、识别重复或冲突、补充节点属性与摘要，最后落图。[单事件入口](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1334)

模型决定“小王”指谁、怎样表达“负责”、两句话是否矛盾及时间信息；程序负责校验类型、查候选、合并 ID、应用时间规则和执行数据库写入。若模型把同名不同人错误合并，数据库约束不会自动理解现实语义；反之，即使提取正确，漏传 group 或查询过滤仍可能产生错误上下文。这也是必须保留中间节点、边和来源的原因。

## 三类状态与两种时间

| 对象 | 保存什么 | 研究时应检查 |
| --- | --- | --- |
| EpisodicNode | 原始材料、来源类型、valid_at、关联事实边 | 原文是否保留，时间是否来自真实来源 |
| EntityNode | 名称、摘要、标签、属性与名称向量 | 实体归一是否错误，摘要是否还含旧事实 |
| EntityEdge | 关系名、事实正文、两端 UUID、来源事件列表与时间 | 当前事实、历史事实和多个支持来源是否区分 |

事件模型中的 `valid_at` 是材料参考时间，`created_at` 是系统创建时间；事实边进一步区分 `valid_at/invalid_at` 与 `created_at/expired_at`。前两者描述事实何时成立／结束，后两者帮助表达系统何时记录／失效这条边。这些字段构成处理历史与新近变化的基础，但并不是数据库自动推导的真相。[episode 与 entity](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/nodes.py#L318)、[事实边](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/edges.py#L263)

当前还存在 community 与 saga：community 提供聚合节点，saga 把事件串成序列。单事件入口的 `update_communities` 默认关闭，所以初始化 Graphiti 后并没有自动为每次输入维护全部聚合结构。可选聚合能改善某些全局问题，也增加维护与删除验证面。

## 数据与调用归属

构造函数注入 graph driver、LLM client、embedder 与 cross encoder；默认组合为 Neo4j driver、OpenAI 抽取模型、OpenAI embedding 与 OpenAI reranker。返回的图对象由宿主消费；回答模型和提示词不属于基本 search 返回的内容。所谓“本地图库”也不意味着内容不会发送给外部模型，调用位置必须按 provider 检查。[构造与默认依赖](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L210)

`group_id` 为图分区作用域，不是认证凭据。不同 driver 还可能采用不同物理实现：FalkorDB 用调用范围 driver clone 选择 graph，多 group 查询再合并；Neo4j 等主要依赖查询范围。当前实现特意避免并发改写共享 `self.driver`，保护请求目标，但这不替宿主判断用户是否有权访问给定 group。[请求范围解析](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1304)、[多组路由](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/decorators.py#L30)

## 采用条件与不确定性

图设计适合持续变动的人、组织、项目与关系问题：除了找句子，还要问“谁与谁有关”“何时变更”“哪些事件支持”。若只有少量个人偏好，构图、实体归一与冲突判断的写入费用可能难以摊薄；是否优于文件或纯向量检索需要相同材料的任务实验。

仓库有 LongMemEval 数据适配和端到端构图评测脚本，其中显式选择数据分片、session 范围、模型与分组。看到脚本不能推出本轮分数；若只使用 oracle 资料范围，也不能与完整 S/M 长历史混排。本轮未测吞吐、质量或失败恢复。[构图评测路径](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/tests/evals/eval_e2e_graph_building.py#L33)

本项目的评审重点不是图数据库能否保存关系，而是模型生成的实体、关系与时间能否稳定映射到业务问题。建议把原始 episode 当证据层，把实体摘要和边当可修订解释层：每次更正先核对来源，再看图如何变化。当前存在这些来源字段，但将它们展示给业务用户、允许人工纠正，以及如何审计纠正后的答案，仍需要宿主完成产品链路。

## 口述自测

1. “12 月才录入一条 9 月发生的事”，四个时间字段应如何理解？
2. group_id 范围正确，为什么仍不能证明系统完成了多租户授权？
