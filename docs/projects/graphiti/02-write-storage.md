---
id: projects.graphiti.write-storage
title: Graphiti：事件、实体与关系如何一起落图？
summary: 沿 add_episode 的提取、去重、时间失效与 bulk 写入追踪提交范围，区分语义更新和输入幂等。
project: graphiti
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - graphiti_core/graphiti.py
  - graphiti_core/utils/maintenance/edge_operations.py
  - graphiti_core/utils/bulk_utils.py
  - graphiti_core/nodes.py
  - graphiti_core/edges.py
---

## 结论与适用版本

Graphiti 写入是“读旧上下文→模型解析→关系决策→批量落图”。关系去重与时间失效发生在持久化之前，bulk 函数将本次 episode、mentions、entity nodes 与 entity edges 交给 driver 的写事务。但模型调用、可选 community 更新和删除后的摘要重建不都在该事务中。**事实去重并不等于整个事件请求的幂等协议**。本页核验当前固定源码，没有模拟重试或并发故障。[写入主线](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1430)

## 入口从真实事件开始

`add_episode` 校验自定义实体类型与排除列表，按 group 建立请求范围 driver，然后读取前序 episode 作为上下文。没有提供 uuid 时构造新的 `EpisodicNode`；提供 uuid 的当前代码会读取已存在事件，而不是把任意传入 uuid 当成创建键。宿主不能未经验证就把消息 ID 传入，声称已实现重复提交只执行一次。[事件取得逻辑](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1450)

以上一次“alpha 负责人小王”为例，extract_nodes 产生候选；resolve_extracted_nodes 查旧图并建立临时 UUID 到现有 UUID 的映射。关系解析必须沿着映射连接实际实体，不能将同名字符串当作可靠外键。接下来 `_extract_and_resolve_edges` 结合关系类型签名与旧边候选，返回 resolved、invalidated、new 三组边；节点摘要只使用 new edges，避免将已存在事实重复追加。[节点与关系阶段](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1471)

## 重复关系与矛盾关系怎样分开

`resolve_extracted_edges` 先以端点、规范化事实文本去掉本批重复，创建边 embedding，再以两端实体约束搜索相关边。完全匹配文本和端点时可直接复用旧关系，并把 episode UUID 加入来源列表；更复杂的相似与矛盾由模型参与识别。候选检索和归一都是有范围的过程，不能提升为全图任意语义等价的严格唯一约束。[关系解析](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/utils/maintenance/edge_operations.py#L424)、[精确匹配路径](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/utils/maintenance/edge_operations.py#L864)

当新输入说“12 月起由小李负责”，模型先识别关系、时间与可能矛盾的旧边，程序再按时间检查。若旧边在新边开始前已结束，二者没有重叠，就不再次失效；若新边较晚，旧边 `invalid_at` 可设为新边开始时间，`expired_at` 记录本次系统失效时刻。若乱序补录更早事实而库里已有更晚事实，代码可反过来把这条迟到旧事实限定为历史。[时间失效规则](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/utils/maintenance/edge_operations.py#L715)

这避免简单“最后入库覆盖一切”，但前提仍是正确的时间与冲突候选。模型没找出冲突或源时间含糊时，字段存在不保证当前答案正确；采用测试要包含补录、未来计划与模糊期限。

## 提交包与事务边界

`_process_episode_data` 将事件关联到已解析节点、事实边和可选 saga；`add_nodes_and_edges_bulk` 创建 session 并调用 `execute_write`。其 transaction callback 分别保存事件节点、实体节点、事件 mentions 边与事实关系。在各 driver 的实现满足契约时，这构成该包的数据库提交边界。缺失的名称向量或事实向量还可在 callback 中生成，因此外部 embedding 成本不会随 SQL 回滚而撤销。[bulk 入口与回调](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/utils/bulk_utils.py#L128)

| 状态 | 是否属于这个落图包 |
| --- | --- |
| episode、实体、mentions、已解析事实边 | 是，由同一 callback 提交 |
| 抽取／去重模型已产生的调用账单 | 否，已发生的外部调用 |
| community 更新 | 入口在落图后可选执行 |
| 宿主任务状态、消息处理回执 | 由宿主另行维护 |

driver 的具体事务、重试和存储语义需要按所选后端继续核验。这里没有运行多后端一致性测试；不能从库统一接口推出 Neo4j、FalkorDB、Neptune 的故障行为完全相同。

## 并发、失败与可恢复性

单事件入口文档建议按顺序 await 同一事件流；前序材料参与实体与关系解析，因此任意并发写同一组会扩大读旧状态的窗口。`max_coroutines` 限制的是各 gather 调用点，各层嵌套的并发上限不能合并理解为全局限额。出现异常入口记录 trace 并重新抛出；如果可选 community 更新在主图提交后失败，请求异常不等于主图没有变化。[入口异常与后续更新](https://github.com/getzep/graphiti/blob/747b480ec6b12ecb718f1e2bc588b20ee36ea9c2/graphiti_core/graphiti.py#L1530)

采用时应由宿主记录事件提交阶段、实际 episode UUID 与来源 ID，失败后先查图再决定重试。需要更强输入幂等时，建立可审计的请求回执和并发策略，不能只依赖关系去重。

还需区分输入顺序与事件顺序：按调用顺序逐条 await 只能减少并发读旧图，不能使历史补录自动成为最新事实。补录必须保留真实 reference_time，并观察新旧关系的区间；若宿主一律使用当前时间，就在进入 Graphiti 前丢掉了时间证据。

## 口述自测

1. 同一内容再次写成新 episode，与同一关系增加一个来源，有什么不同？
2. community 更新失败后重试整个输入，可能重复支付哪些工作？
