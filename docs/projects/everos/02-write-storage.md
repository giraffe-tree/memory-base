---
id: projects.everos.write-storage
title: EverOS 如何从会话缓冲写成有来源的记忆文件？
summary: 会话锁只覆盖边界切分，提取由独立supervisor继续执行；daily-log追加与废弃使用owner锁与来源检查，文件原子替换之后再异步投影到索引。
project: everos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/everos/service/memory/_memorize.py
  - src/everos/service/memory/_queue.py
  - src/everos/core/locks.py
  - src/everos/memory/extract/pipeline/user_memory.py
  - src/everos/infra/persistence/markdown/stores.py
  - src/everos/infra/persistence/markdown/_base/writer.py
  - src/everos/infra/cascade/reconciler.py
---

## 沿一次真实入口追踪

本页固定 `80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9`，只做静态核验。`Memorizer.run(payload)` 接收 session_id、messages 与 app/project 等作用域。输入先经 ingest，再由 BoundaryDetection 合并已有缓冲、判断边界、把完成单元写成 MemCell，剩余尾部继续留在缓冲；`defer_extraction` 可以只缓冲，flush 则强制处理尾部。因此 add 返回 accumulated 不表示失败，也不表示已经生成 Episode。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py#L85-L117) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py#L181-L218)

例如用户分三次说明“先用 Python”“兼容性出问题”“最终改用 Rust”，框架可能先累积相关消息，再把它们放在同一个来源单元。边界模型的判断影响抽取上下文；若客户端过早 flush，也会改变记忆粒度。因此调用节奏应作为实验配置保留，不能只保存最后一次请求文本。

## 锁保护什么，取消又影响什么

`run` 用 `(app_id, project_id, session_id)` 构造 session lock key，覆盖读取缓冲、合并、边界切分和写入。这样同进程内两个请求不会同时读取旧缓冲后互相覆盖尾部。完成单元持久化后，提取移交 ExtractionSupervisor，在锁外运行，调用方通过 asyncio.shield 等待；客户端断开导致请求取消时，提取仍由 supervisor 持有。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_memorize.py#L106-L177)

这个选择降低了长时间模型抽取占用会话锁的范围，但不是跨进程分布式锁的证明，也不表示进程被强杀后所有在内存中的提取都能自动恢复。当前失败细节要结合队列和持久状态看，不能把 shield 解释为掉电持久性。锁模块明确约定一份 memory root 由一个进程拥有，NamedLocks 是进程内状态；部署多个进程共享同一根目录不能直接套用这些保证。模型输出错误重试与整个提取重复运行也不是同一个机制。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/core/locks.py#L1-L26)

## 从 MemCell 到 Markdown

UserMemoryPipeline.run_cell 接收已经切好的 Cell 和 memcell_id，调用 EpisodeExtractor，再为每个用户 sender 创建领域 Episode。转换时由应用注入 owner、session、parent 等工程上下文，写入成功才返回 ref 和 EpisodeExtracted。来源身份因此由应用与持久账本控制，而不是完全信任模型生成 owner_id。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/memory/extract/pipeline/user_memory.py#L59-L115)

daily-log store 将领域对象转成带 inline 字段与 sections 的条目，统一返回相对路径。其追加与废弃路径先拿 owner lock，再执行调用者提供的 only_if 来源检查：若来源检查发现 MemCell 已删除，就跳过写入；删除方也使用同一个 owner 锁等候已通过检查的写入结束。这一机制只适用于采用该来源检查契约的daily-log路径，不能推广到所有记忆类型。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L78-L159)

Profile 与 AgentSkill 的 write 虽也拿 owner 锁，但没有相同的 only_if 参数；因此综合画像与技能不能直接套用来源删除后阻止晚到结果写入的保证。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L492-L509) [源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/stores.py#L588-L609)

Base writer 确保目标在 memory root 中，写同目录临时文件，flush/fsync 后用 os.replace 替换目标。它提供单文件原子可见性；并没有把 SQLite、多个 Markdown 文件和 LanceDB 合为一个事务。对于多个 owner 的复制或多个派生策略，仍可能部分成功，需要按事件、文件和状态排障。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/persistence/markdown/_base/writer.py#L150-L177)

## 文件之后怎样进入检索

派生索引不是每次都在文件写入事务中同步提交。Cascade 比较磁盘文件与 SQLite 的 md_change_state：新增文件生成 added，mtime 改变生成 modified，缺失文件生成 deleted。已完成且未改变的项跳过；可重试的失败会被再次提出，不可重试且未编辑的文件不会无限自动排队。它还特别处理曾删除后按旧 mtime 恢复的文件。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/infra/cascade/reconciler.py#L1-L37)

这种设计允许用户手工修改文件后重建投影，也意味着“Markdown 可读”与“向量已更新”之间存在延迟。mtime 对账、watcher、worker 和 backfill 各自负责不同恢复路径，不能只监听文件事件而忽略周期扫描。本轮没有实跑这些后台循环，故不能给出索引延迟上界。

## 异步接受与重试的边界

异步 HTTP 路径把请求体作为一行写进 SQLite memorize_inbox，返回 202；worker 按 id 领取，保证同一 session 不同时执行两条，整体受 max_concurrency 限制。有待处理行时，同 session 的同步请求也需入队以保持顺序。交付失败的行会标 failed 并继续后续任务，不能理解成无限重试直到成功；启动时对处理中断行的恢复则是另外一条路径。[源码](https://github.com/EverMind-AI/EverOS/blob/80ef766b690dd02eb6caa4e9f78bad4a9f0c1ee9/src/everos/service/memory/_queue.py#L1-L22)

采用时应把“队列已接受”“MemCell 已落账”“抽取完成”“文件已写”“投影已更新”分别观测。本文未执行取消、重复提交和进程重启实验；建议从这些状态交界处注入失败，检查来源是否丢失、派生内容是否重复以及用户得到的错误是否反映部分完成。

## 一条输入可以有多个成功状态

同一 MemCell 可能已经写入来源账本，用户 Episode 已完成，而 AgentCase 或后续事实策略失败。因此接口的综合状态不应替代逐轨道观测。排障时先检查该来源单元是否存在，再确认相应事件是否发布、对应 Markdown 是否生成，以及 Cascade 是否处理到最新版本。重新发送全部原始消息之前，应先弄清失败发生在哪一个阶段，避免重复边界切分或重复派生。

对于主动缓冲的客户端，flush 也是业务操作链的一部分：验证客户端正常结束、断线和空闲后是否触发 flush，以及 flush 返回排队时是否继续轮询。否则“写过却搜不到”可能只是消息仍在缓冲，而不是文件或向量库丢失。上述均是待运行的实验设计，不是现有测试已经通过的结论。

## 自测

1. 单文件 os.replace 保证与多存储原子事务之间有什么区别？
2. daily-log 的 only_if 怎样阻止来源删除后的追加？为什么不能据此推断 Profile 与 Skill 也有相同保证？
