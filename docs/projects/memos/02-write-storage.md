---
id: projects.memos.write-storage
title: MemOS 怎样把输入写进 Cube，为什么返回 ID 还不够？
summary: 写入行为依赖后端和同步模式；tree_text由Reader生成条目后交给图管理器，批量异常与后台整理需要独立追踪。
project: memos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/memos/mem_os/core.py
  - src/memos/memories/textual/item.py
  - src/memos/memories/textual/tree.py
  - src/memos/memories/textual/general.py
  - src/memos/memories/textual/tree_text_memory/organize/manager.py
  - src/memos/mem_scheduler/base_mixins/queue_ops.py
---

## 从 MOSCore.add 开始

固定 `d326a6419467c2205041b58533b0ebfdf4f38173` 的 add 接受 messages、memory_content 或 doc_path，三者至少有一个。它用指定用户或默认用户选择 Cube；未指定 mem_cube_id 时取首个可访问 Cube，指定时调用访问校验。接着检查 Cube 已加载，并读取其 text_mem.mode；async 模式要求 scheduler 工作。这意味着多 Cube 应用需要明确路由，不应把“第一个可访问容器”当作业务含义上的自动最佳归属。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L684-L752)

假设输入包含“此前 Python，今天改成 Rust”。对于非 tree_text 的 messages 分支，MOS 逐条创建 TextualMemoryItem，带 user_id、session_id 与 source=conversation，然后调用 text_mem.add。对于 tree_text，消息先以 chat 类型送 MemReader，同步取 fine、异步取 fast，再把结果展平后写到 TreeTextMemory。直接文本与文档也有各自分支，不能以一个输入路径推断所有入口都使用同一提取策略。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L753-L799) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L848-L923)

## 数据模型怎样保留来源与历史

TextualMemoryItem 的 metadata 包括用户、会话、状态、版本、history、source、可见性和时间。TreeNodeTextualMemoryMetadata 进一步区分 WorkingMemory、LongTermMemory、UserMemory、工具轨迹、原文件和技能等类型。SourceMessage 用内容、message_id、doc_path、时间等定位原始依据，还允许额外属性。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/item.py#L16-L44) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/item.py#L96-L200)

ArchivedTextualMemory 声明轻量历史和完整归档节点关联：旧文本可以留在 history，完整来源与 embedding 可由 archived_memory_id 指向另一节点。这里必须区分“字段可表达版本链”与“每个写入入口都自动补全版本链”；例如直接包装消息的分支并不因此完成跨消息事实去重，也不会自动知道 Python 与 Rust 哪一个是最终决策。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/item.py#L47-L94)

## tree_text 的持久化与后台整理

TreeTextMemory 初始化 extractor/dispatcher LLM、embedder、graph_store、reranker 和 MemoryManager。其 add 直接委托 memory_manager.add；管理器默认采用批量方式，把条目 metadata 转成图节点，并按类型构造 Working 与长期节点。当前代码有明确 TODO：因为 Working ID 与 item.id 相同，批量路径暂时停止 `_submit_batches(working_nodes)`，只提交 graph_nodes。不能仅凭 memory_type 枚举断言每次 add 同时实际写入两份工作与长期节点。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree.py#L38-L114) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree_text_memory/organize/manager.py#L143-L245)

更重要的是失败语义：graph_node_ids 与 added_ids 在数据库批量提交前收集，提交 future 抛出的异常在循环内记录日志，外层仍返回 added_ids。因而静态上不能把“返回某个 ID”当作节点持久化成功证明；需要再读图数据库或观察错误状态。本轮没有制造真实图数据库故障，所以这是实现可见的部分失败风险，不是实测的丢数结论。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree_text_memory/organize/manager.py#L185-L248)

同步模式还执行 working cleanup，reorganize 打开时向图整理器投 QueueMessage。索引、关系和归档的最终状态可能继续变化；提交完成与整理完成是不同观测点。MemoryManager 的局部队列与 MOS scheduler 也不是同一个工作队列，不应合并解释为一条有统一持久确认的事务流水线。

## general_text 为什么不同

GeneralTextMemory.add 直接批量 embed 文本，把 item 完整 payload 和 vector 以相同 ID 写向量库；update 重算向量，再由向量库更新。这里的主要真相与检索 payload 同在所选向量后端，和 tree_text 的图节点、关系与整理流程不同。不能笼统说“MemOS 都把记忆存在 Neo4j”，也不能把对某一个后端的删除或一致性结论推广到所有 Cube。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/general.py#L81-L119)

## 调度和一致性验收

MOS.add 会把读取、添加或偏好任务提交 scheduler，队列层按任务优先级拆为 immediate 和 queued，携带 trace_id、业务 task_id 与状态跟踪；配置可能用 Redis 或本地队列。记录了 task_submitted 不等于任务已经处理，更不等于模型提取质量正确。日志、任务状态和最终节点三者应关联起来。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_scheduler/base_mixins/queue_ops.py#L34-L92)

本文未运行真实模型、并行写入或崩溃恢复。建议固定 Cube 后端和模式，给重复输入、来源更正和批量中间失败分别造合成样本，核对每个返回 ID、节点状态、版本和来源；再测 scheduler 停止与重启后是否补齐。只记录 MOS.add 正常返回会漏掉上述部分完成边界。

## 来源保留也需要验证入口差异

带 SourceMessage 的树形元数据可以表达来源，但应用仍需确认 MemReader 在自己的输入类型中填了哪些字段。用文档路径写入、直接字符串写入、结构化对话写入时，应分别检查来源能否定位回同一条原始记录；不能看到数据模型允许 message_id，就宣称系统已经保存了消息级审计链。

还应区分“重新 embedding 同一条正文”和“重新运行模型抽取”：前者通常只重建检索表示，后者可能改变内容、粒度和关系。若要支持纠正后回放，应保留原始输入、有效模型配置及版本，而不只保留向量。MemoryManager 的批量异常路径尤其需要在备份前确认真实落库状态，避免把尚未成功的返回 ID 固化进外部任务账本。

## 自测

1. 为什么在批量路径里，返回 added_ids 还需要逐项核对真实节点？
2. 同一段 messages 进入 general_text 与 tree_text 时，哪些模型和持久化步骤不同？
