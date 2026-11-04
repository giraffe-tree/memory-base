---
id: comparisons.fact-updates
title: “改用 Rust”之后，旧事实怎样更正和遗忘？
summary: 对照 ReMe 的分层整合与 Mem0 的追加／显式更新，区分当前状态、历史保留、过期隐藏和删除传播。
project: comparison
projects:
- reme
- mem0
minutes: 10
status: source_verified
prerequisites:
- projects.reme.updates-forgetting
- projects.mem0.updates-forgetting
sources:
- project: reme
  path: reme/steps/evolve/dream/extract.py
- project: reme
  path: reme/steps/evolve/dream/integrate.py
- project: reme
  path: reme/steps/evolve/dream/finish.py
- project: reme
  path: reme/steps/file_io/delete.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/memory/storage.py
- project: reme
  path: reme/schema/dream.py
---

## 先定义想要的结果

周一“先用Python”，周二“决定改用Rust”。正确结果不是让所有历史都消失，而是当前任务使用Rust，旧经历仍有适当时间语境；若用户明确要求删除，还要说明哪些载体被删除、哪些仍保留。追加、覆盖、归档、过期和彻底清除是不同操作。

本页对照 ReMe `d323356e6f11` 与 Mem0 `ed1f10fc8708`，是实现层研究，尚未开展两边真实模型的事实冲突或删除传播实验。

## ReMe：来源、daily与digest分别变化

AutoMemory可以把新状态合入关联daily。Dream再扫描日期窗口内变化的来源，提取知识单元，查询已有digest，通过CREATE、CORROBORATE、REFINE或CORRECT等整合动作处理长期知识。模型提示描述了目标语义，但程序并不因此知道每句事实是否真正正确。

Finish依据成功／失败／延后来源推进处理水位，使用扫描时观察的mtime，让提取后发生的修改有资格继续处理。默认两天扫描窗口意味着窗口外来源不一定进入下一轮。水位、整合副作用和派生索引是不同状态，不构成一个跨文件事务。

## Mem0：自动追加与显式更正分开

当前自动提取走ADD-only，新的Rust事实会尝试成为新UUID记忆，并非自动对旧Python项执行UPDATE。模型会看到有限旧记忆作为背景，但这里没有通用“最新事实自动覆盖旧事实”的保证。若应用要求当前状态唯一，宿主需要明确检索定位、事实ID与覆盖策略。

显式 `update(id, text=...)` 保留该ID，更新主store的向量、payload、hash、词形文本和时间，再记录SQLite UPDATE history，文本变化后清理旧实体链接并尝试重连。identity scope字段不能靠普通metadata改写。主store和history、实体collection之间没有统一事务，因此history失败可能发生在主记录已经改变之后。

## 过期与删除不是同一回事

| 操作 | ReMe当前基线 | Mem0当前Python OSS基线 |
| --- | --- | --- |
| 追加新决定 | 写／更新daily，再可能整理digest | add推断分支追加新记忆项 |
| 覆盖指定内容 | 文件工具修改；Dream可更正长期知识 | 显式update指定memory_id |
| 删除来源／记录 | 文件删除及引用检查，不保证digest事实级撤销 | 主store删除后记录DELETE history，并尝试实体清理 |
| 过期隐藏 | 不能推断有与Mem0相同的expiration协议 | expiration_date默认影响search/get_all可见性，get(id)仍可读取 |
| 历史保留 | 来源和笔记层需分别检查 | DELETE history可保留old_memory，最近消息缓存也不因单项delete自动清除 |

Mem0的删除API不能直接解释为所有内容痕迹已抹除；SQLite变更历史保留旧文本是可见实现。本轮局部存储样本记录ADD、UPDATE、DELETE后仍能读到DELETE的old_memory，但该样本没有调用真实vector backend或Memory.delete。

ReMe来源删除同样不能证明digest不再含其派生事实。它有文件链接和辅助图，不等于拥有每条知识的完整依赖追踪与级联事实撤销。

## 设计共同验收，而不是统一命令

两边使用同样的周一／周二故事，分别观察来源、当前载体、历史、检索和模型输入。先明确应用要追加历史还是覆盖当前项，再执行各自接口；不应强制给两边都调用一个叫add的函数，就把不同结果当成同一契约下的胜负。

然后分别注入“内容已改、history或水位未提交”的故障，重启后记录实际可读状态。最后测试删除后是否还能经历史接口、旧引用、缓存、备份或原始来源找到内容。保留哪些历史是产品与数据管理决定，应在验收中明确，不能由单条成功响应推断。


## 源码定位

- [reme · reme/steps/evolve/dream/extract.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/extract.py)
- [reme · reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [reme · reme/steps/evolve/dream/finish.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py)
- [reme · reme/steps/file_io/delete.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/delete.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)

- [reme · reme/schema/dream.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/dream.py)

## 自测

1. Mem0返回“删除成功”，为什么不等于所有包含旧内容的历史都被清空？
2. ReMe选择CORRECT整合动作，为什么仍要检查扫描窗口、失败来源和实际digest内容？
