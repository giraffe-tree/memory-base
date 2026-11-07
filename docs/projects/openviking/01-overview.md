---
id: projects.openviking.overview
title: OpenViking 如何把文件、会话与记忆组织成上下文服务？
summary: VikingFS持有可寻址内容，队列生成派生索引，服务端还负责按预算组装上下文；当前召回实现不能按类名误读为递归目录搜索。
project: openviking
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - openviking/service/core.py
  - openviking/session/session.py
  - openviking/storage/viking_fs/_access.py
  - openviking/retrieve/hierarchical_retriever.py
  - openviking/retrieve/context_assembler/pipeline.py
---

## 结论与研究边界

OpenViking 是围绕 `viking://` 命名空间构建的上下文服务：资源、会话、记忆、技能能够被寻址、读取和检索；模型提取、存储、后台索引和上下文编排由不同模块承担。固定版本为 `1bee73853e2400086632596198282f3c5d118312`，2026-11-07 只读核验。这里讨论开源 Python 服务主线，不把部署到火山引擎的托管能力或宣传评测等同于本地已验证结果。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/service/core.py#L82-L155)

它最值得借鉴的地方，是把“保存过”“索引可查”和“本次进入提示”做成不同状态。文件是可读内容的载体，向量库是查询结构，`assemble_context` 再从候选中决定读取深度、预算和输出格式。检索返回一个 URI，不意味着模型已读取正文；返回渲染文本，也还需要宿主实际把文本传入自己的模型调用。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py#L85-L195)

## 从一个跨会话约束开始

假设用户说“Phoenix 项目先用 Python”，随后改成 Rust。宿主先把消息加入 Session；提交会话时，`commit_async` 先把原始消息归档并发布新的保留窗口，再通过持久队列进行 Working Memory 和长期记忆处理。模型按照启用的记忆类型抽取、合并内容，程序将结果写入 VikingFS，并排入 embedding 工作。新会话可在相同账号与允许的路径范围内检索相关记忆，再按预算读取摘要或全文。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/session.py#L1469-L1535)

这个例子有三个不同验收点：原始纠正是否进入归档、记忆是否实际更新并完成索引、后续任务是否取回新结论。只看到提交返回 `task_id`，不能判定 Rust 已经替代 Python；更不能判定最终回答必然遵守它。工程上应把任务完成状态、记忆文件和实际检索响应一起保留。

## 模块如何分工

`OpenVikingService` 构造基础设施和子服务，VikingFS 承接文件操作，VikingDBManager 承接索引，QueueManager 承接持久工作；资源、会话、搜索和 MCP 服务由同一服务对象组合。MCP 是工具接入边界，既不是数据库内部协议，也不是每次 Python 函数调用都要经过的远程环节。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/service/core.py#L109-L155)

路径不是直接拼接操作系统用户主目录。访问层把 `viking://...` 映射到账号对应的 `/local/{account_id}/...`，并在读取、目标路径和共享范围上执行策略。账号上下文与用户身份因此属于请求级数据，不应由用户输入文本来替代。文件和向量侧的过滤必须一起成立，才能讨论隔离效果；本轮没有做跨账号攻击或并发服务实测。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/storage/viking_fs/_access.py#L894-L908)

L0、L1、L2 表示可选择的内容层级，当前检索器给 L0/L1 配置 `.abstract.md` 与 `.overview.md` 后缀。但特别要纠正名称造成的误读：此版本 `HierarchicalRetriever.retrieve` 明确执行一次全局向量搜索，再按模式可选重排，并非每次查询从根目录递归下钻。目录仍用于组织、范围过滤和分层读取；这不证明召回算法必然采用树遍历。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/hierarchical_retriever.py#L202-L263)

## 采用条件与代价

若应用需要把文档、任务会话和长期记忆统一放到可寻址的结构中，并希望服务统一做上下文预算，OpenViking 比一个只暴露 add/search 的库覆盖更广。其代价也来自同一范围：需要理解存储、模型配置、后台队列、索引延迟、权限和宿主接入这几条生命周期，不能只看一次向量查询耗时。

这是根据模块分工得出的采用判断。当前代码中的请求级 embedding 缓存能复用同一请求中相同查询的向量化；可选 query expansion、rerank、digest 则会增加模型或外部调用。它们带来的质量收益和 token 节约需要相同模型、数据和预算下测量，本文没有这样的结果。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/retrieve/context_assembler/pipeline.py#L112-L180)

当前主项目源码标记 AGPL-3.0，商用采用应核对实际使用组件及其许可；不能套用早期文章中的许可证口径。这里没有执行上游依赖、索引服务或真实提取，因此“源码存在故障恢复路径”与“目标部署已经满足恢复目标”仍是不同判断。

## 如何把采用判断变成实验

可以把 Phoenix 的原始决策、更正、工具输出和最终验收分四次提交，保留每次 Session 的 task_id。第一次查询只要求返回相关 URI，第二次要求返回预算内上下文，第三次才让宿主回答。这样能分别判断问题发生在文件内容、索引候选、预算裁剪还是回答阶段，避免把所有失败都称为“记忆差”。同一事实若同时落在事件与主题文件中，还要检查这两个入口能否说明各自来源，以及上下文是否把历史状态当成当前状态。

这条验收建议是根据服务分层作出的推断，没有声称当前系统必然失败。若实际需求只有少量稳定偏好，应先用固定文件直接读取做基线，再观察自动提取与索引是否改善准确性或延迟；新增的队列和模型步骤应当带来可测收益。

## 自测

1. 为什么 `commit_async` 成功返回与“新事实已能被下一次问答使用”之间还隔着两个状态？
2. 如果只看到类名 HierarchicalRetriever，应该再读哪个入口才能判断检索是否实际递归？
