---
id: projects.mem0.runtime-consistency
title: 同步、异步与批量写入分别保证什么？
summary: Python OSS 在请求内组织分阶段工作；异步包装和局部数据库锁不能提供跨存储事务或业务幂等。
project: mem0
minutes: 9
status: source_verified
prerequisites: [projects.mem0.write-path, projects.mem0.storage-index]
sources: [mem0/memory/main.py, mem0/memory/storage.py, server/server_state.py, tests/memory/test_main.py, tests/memory/test_storage.py]
---

## 结论：这是请求内流水线

当前 Python OSS 的 `Memory.add` 在调用内依次完成召回旧信息、提取、embedding、持久化、历史和实体维护；没有从这个入口建立一个持久化队列，再交给后台 worker 保证最终执行。`AsyncMemory` 让调用方使用 await，并通过 `asyncio.to_thread` 调用同步 provider，它不是另外一种持久化作业系统。

本页基于 `ed1f10fc8708`。这里描述代码和上游测试覆盖的局部契约，尚未进行多进程并发或宕机恢复实测。

## 状态归属决定恢复方法

| 状态 | 当前持有位置 | 需要注意的边界 |
| --- | --- | --- |
| 当前批次提取结果、hash 集合、已落库列表 | add 调用的局部变量 | 进程退出后不作为持久化工作计划保留 |
| 主记忆正文、向量与 payload | 配置的 vector store | 可见性和并发更新由具体后端决定 |
| ADD/UPDATE/DELETE 历史、近期消息 | SQLiteManager | 事务范围仅限该 SQLite 连接中的操作 |
| 实体与 linked_memory_ids | 延迟创建的独立实体 collection | 维护失败可被吞下，不能作为主记录的原子附属表 |
| REST 配置和 Memory 实例引用 | server_state 的进程全局状态 | 锁保护引用访问，业务操作没有因此串行化 |

SQLite 近期消息按实体作用域保存，保留最近十条供后续提取参考。它不是无限增长的完整对话档案，也不是所有输入在任何错误路径都已保存的保证。

## 批量降级允许部分成功

默认推断链先批量生成事实 embedding，失败后逐条尝试，无法向量化的事实不会进入后续记录列表。主库批量 insert 失败后，也会逐条 insert，只有确认写入的记录进入结果、历史和实体关联；一个都写不进去则抛 `VectorStoreError`。

这比把被后端拒绝的记录也报告为成功更明确，但“返回列表”仍可能只覆盖提取事实的子集。调用方需要比较输入、提取与最终结果，不能根据 HTTP 200 或没有抛异常就假定整批全部完成。若批量后端部分写入后才抛错，接下来的逐条重试效果还取决于后端对同 ID insert 的语义。

历史批写同样有逐条降级，失败会记日志；实体维护整体采用尽力而为策略。它们与主库没有共同提交或回滚。上游 `test_rejected_records_are_not_reported_as_add` 与全部失败测试支持的是结果报告边界，不是完整事务性证明。

## 异步改变等待方式，不自动消除竞争

`AsyncMemory` 把 LLM、embedding、vector store 和 SQLite 等阻塞工作转移到线程；实体查询内部还有最多四个并发任务。同步实现的实体召回使用线程池，并不意味着 semantic、BM25、实体三路在整个同步检索中完全并行。

取消 await 不必然终止已经在线程或远程服务中的写入。当前入口没有统一的操作 ID 来保证调用方超时重试只产生一次业务记录。hash 去重会比较本批与召回的旧候选，但候选并非完整唯一约束；两个并发调用也可能同时观察不到对方。应把重试幂等作为宿主与选定后端的额外验收点。

`SQLiteManager` 使用连接级线程锁与 BEGIN/COMMIT，避免同实例并发破坏事务。该锁既不覆盖主库，也不是多进程全局业务锁。`Memory.close` 释放其 SQLite 连接，不能据此认为所有 provider 客户端和远端资源都由它统一关闭。

## REST 配置替换也需要明确边界

`server_state` 用 RLock 保护当前配置与 Memory 引用；更新配置时创建新的 Memory 对象，并尝试将覆盖项保存到 PostgreSQL。获取引用后，请求在锁外执行业务，因此配置切换不等于暂停所有正在执行的请求。

这意味着运行中旧请求可能仍持有旧实例；配置持久化失败也会记录告警而不必然撤销当前进程的新配置。跨进程实例、旧连接回收和配置失败恢复都需要部署级验证，不能从这把状态锁推导出完整热更新协议。

## 源码定位

- [同步与异步执行、批量降级、实体并发](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`Memory`、`AsyncMemory`。
- [SQLite 锁、事务和十条消息窗口](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)：`save_messages`、`batch_add_history`。
- [进程级实例与配置替换](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/server_state.py)：`update_config`、`get_memory_instance`。
- [部分成功与并发召回测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/memory/test_main.py)。

## 自测

1. 为什么 SQLite 的一笔事务不能保证主记忆、历史和实体同时提交？
2. add 超时后重新提交，哪些条件会影响是否重复，应该观察哪些存储？
