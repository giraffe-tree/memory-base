---
id: projects.openviking.write-storage
title: OpenViking 提交会话后，什么落盘，什么仍在后台生成？
summary: Session采用归档和持久队列两阶段处理；模型操作先解析为受约束的文件变更，再生成向量索引，部分写入不能安全地整批重放。
project: openviking
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - openviking/session/session.py
  - openviking/session/memory/extract_loop.py
  - openviking/session/memory/memory_updater.py
  - openviking/session/memory/dataclass.py
  - openviking/storage/viking_fs/_ops.py
---

## 三个完成点

本页固定 `1bee73853e2400086632596198282f3c5d118312`，仅静态源码核验。会话写入需要分开观察：消息归档持久化、记忆提取应用完成、embedding 索引可见。`Session.commit_async` 的第一阶段在路径锁内读取最新 Session 状态，拆分归档和保留消息，写可恢复意图及原始归档，发布 `phase1.status=ready`。随后注册任务并发布 QueueFS 消息，返回可追踪的任务身份。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/session.py#L1492-L1535)

所以“异步”不是不保存原文就启动一个随请求结束而消失的协程。原始归档与后续任务有独立持久状态；与此同时，第一阶段成功不保证后续模型调用、文件合并或向量生成已经完成。读写双方必须明确等待哪个完成点。

## 原文如何进入记忆变更

以“先用 Python，后来改成 Rust”为例，Session 将带角色和 parts 的消息保留为经历。第二阶段读取归档消息、策略和 Working Memory 所需上下文，再运行记忆提取。不同记忆类型、工作摘要与技能受有效策略控制；不应假设每次提交都会产生所有类型。第二阶段还写 `.done` 或 `.failed.json` 等终态，供后续读取及排障判断归档是否处理完成。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/session.py#L2615-L2835) [源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/session.py#L3145-L3208)

`ExtractLoop.run` 是模型交互循环：构造指令和工具，允许提取过程读取相关已有内容，将模型输出解析成结构化 operations，再验证和解析页面身份、URI、补丁等。模型提出“新增、改写或关联”，程序决定该输出是否合法以及最终操作的路径。它不是让模型任意执行 shell 或直接越过存储层写磁盘。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/extract_loop.py#L197-L330)

模型输出里的临时 `page_id` 也不是持久存储身份。`WikiLink` 先用页面编号描述关联，解析后才映射到 URI；类型模型还规范化关系名和权重。因而保留来源与页面映射有助于解释“这条关联来自哪个抽取输出”，但链接字段本身并不能证明事实正确。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/dataclass.py#L54-L116)

## 文件变更与派生索引

`MemoryUpdater.apply_operations` 先检查解析错误、迁移是否合法及未解析目标，再逐项调用 `_apply_upsert`。成功、编辑、删除、跳过与错误分别记录到结果对象；一个操作失败时会记录其 URI，而不是把已经成功的文件变更装成全局回滚。替换与拆分还要重映射已有链接，避免原页面被迁走后关系仍指向旧地址。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/memory_updater.py#L967-L1100)

这里不宜把 pathlock 叫成关系数据库意义上的跨文件、跨索引事务。源码的 `MemoryUpdateError` 专门强调“部分写入不能视为安全重放”；因此失败重试必须知道哪些动作已生效，不能向用户承诺整批恰好一次语义。归档让经历可追溯，操作日志与结果让变更可诊断，两者都不能消除提取的语义误判。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/memory_updater.py#L797-L865)

文件写完还要向量化。`_vectorize_memories` 根据成功写入或编辑的 URI 组装 embedding 消息并入队；入队失败的处理取决于 `raise_on_enqueue_failure`，存在记录错误而不把该失败转成同一层异常的分支。因此应同时检查文件内容、排队状态和检索结果，而不能把文件存在作为“所有索引已一致”的证据。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/memory_updater.py#L1957-L2098)

## 删除、来源与恢复边界

记忆删除通过 `VikingFS.rm` 清理索引和文件，缺失路径有处理孤儿索引的幂等分支。当前顺序是先向量记录后文件；若文件删除失败，可能需要重试，不能从代码直接推出两层原子提交。普通记忆删除也不等于原始 Session 历史已被抹除：应明确删的是哪个 URI、是否递归、是否同时要求清除来源归档。[源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/storage/viking_fs/_ops.py#L237-L306) [源码](https://github.com/volcengine/OpenViking/blob/1bee73853e2400086632596198282f3c5d118312/openviking/session/memory/memory_updater.py#L1940-L1955)

本轮没有注入崩溃、强制取消或模拟索引失败；所有恢复判断来自固定版本实现。上线前最有价值的实验是：同一纠正提交两次、在文件成功但 embedding 未完成处停止服务、重启后查任务和最终召回，并检查是否出现重复事实或旧结论。测试应记录归档、变更和索引三种状态，不只记录 HTTP 返回码。

## 重复与故障实验应记录什么

对同一段纠正重复提交，至少保存原始归档编号、模型操作解析结果、成功写入列表和 embedding 入队结果。若第一次已改写文件但最后一步失败，第二次不能只看返回状态相同，就认定具有幂等性；应比较文件是否重复合并、来源是否重复、链接是否仍指向有效页面，以及查询是否出现两个相互矛盾的版本。

对“先删索引再删文件”的删除顺序，也可以在文件删除阶段注入失败，然后重试相同 URI。预期与实测分开：源码提供缺失项清理与部分错误记录，实际是否收敛还取决于后台工作是否继续运行。恢复验收需要核对原始归档是否仍存在，因为业务要求的遗忘范围可能大于一条记忆文件。

## 自测

1. 为什么持久队列存在仍不能把整个写入流程描述为原子事务？
2. 删除一个记忆文件之后，哪些来源和派生内容仍需要单独确认？
