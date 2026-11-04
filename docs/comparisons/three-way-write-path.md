---
id: comparisons.three-way-write-path
title: 写下以后，什么时候才算下一次能用？
summary: 把保存、提交、索引、prompt投影与请求重放分别检查，三套系统的完成信号不能互换。
project: comparison
projects:
- reme
- mem0
- letta
minutes: 11
status: source_verified
prerequisites:
- projects.reme.write-path
- projects.mem0.write-path
- projects.letta.write-path
sources:
- project: reme
  path: reme/steps/evolve/auto_memory.py
- project: reme
  path: reme/config/default.yaml
- project: mem0
  path: mem0/memory/main.py
- project: letta
  path: src/agent/memory-format.ts
- project: letta
  path: src/backend/local/system-prompt-compilation.ts
- project: letta
  path: src/agent/memory-operation.ts
- project: letta
  path: src/agent/memory-git.ts
- project: letta
  path: src/agent/subagents/builtin/memory.md
---

## 先定义“完成”的观察面

保存了内容、调用返回成功、重新查询命中和模型真正使用，是四种不同观察。三个固定版本的证据如下。本文是源码核验，没有运行三套系统的完整写入或故障恢复。

| 观察点 | ReMe证据 | Mem0证据 | Letta证据 |
| --- | --- | --- | --- |
| 进入材料 | session_id关联来源，保存消息后查当天关联daily。 [_save_session_messages / _find_session_note](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py) | scope近期十条＋旧候选十条作为提取背景。 [_add_to_vector_store](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | MemFS v2顶层core、子层deferred，不能直接映射daily。 [isCoreMemoryPath](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) |
| 写与用之间 | 文件变更经监听更新索引；写成功非立即搜索可见。 [index_update_loop](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml) | 先主store插入，再history、entity、消息缓存。 [_add_to_vector_store](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 工作树编辑与HEAD读取不同；本地prompt编译从HEAD。 [collectCommittedMemoryFiles](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| 重复与协调 | 成功request_id回执重放；非任意失败exactly-once。 [AutoMemoryStep.execute](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py) | hash检查本批与检索旧候选；非全scope语义幂等。 [existing_hashes / seen_hashes](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | harness writers有文件锁，但明确不覆盖主Agent自身编辑。 [claimMemoryOperation](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-operation.ts) |
| 提交与同步 | 回执、正文、索引不组成一个全局事务。 [execute / _execute](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py) | 主库与SQLite／实体没有跨store提交事务。 [Phase 6–8](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | post-turn同步遇dirty返回dirty；不替任意编辑自动commit。 [syncPendingMemoryCommitsAfterTurn](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) |


## 同一个批次怎样提交

合成消息m1是“alpha先用Python”，m2是“现在改为Rust”。ReMe可以用稳定session_id关联来源，并为不同提交批次使用不同request_id；Mem0用user／agent／run scope隔离记忆，当前自动提取只追加新UUID；Letta不是向第三方记忆层提交同构add的模型，而是Agent运行时利用工具维护自身文件与状态。

因此比较时先约定业务目标，再映射各自协议。Mem0内容hash不能直接替代ReMe成功请求回执；Letta的Git revision也不能被当作请求ID。这些字段分别标识文本、请求批次和内容版本。

## Letta的三个容易混淆的状态

第一是工作树：普通文件编辑可改变磁盘内容，Memory渐进读取可读到它。第二是Git HEAD：本地core投影从已提交内容获取，未提交变化不自动变成system。第三是同步和重编译：已提交后仍需沿实际调用检查是否同步、何时重新编译并用于下一轮。

[syncPendingMemoryCommitsAfterTurn](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) 发现dirty会报告而不是无条件替Agent提交。当前 [builtin memory subagent](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/subagents/builtin/memory.md) 是冲突与无效树repair-only，也不能从名字推导出“它每一轮都自动提炼所有经历”。

## 共同故障样本

先使用受控模型／provider输入m1，然后在内容已落盘、下一层状态尚未确认时中断：ReMe观察正文与回执／索引，Mem0观察主记录与history／entity，Letta观察工作树、HEAD与prompt revision。重启后分别记录能读到什么、是否重复执行、是否需要人工处理。

这些样本是后续验收方案，不是本轮运行结果。Letta本轮只执行了元数据、路径分类和文件树约束helper，不能拿这些通过证明Git提交、hook或prompt已经完整跑通。

## 采用条件的推断

若要求“请求超时后可识别已完成批次”，应检查具体请求回执；若要求“相同内容少重复”，应检查去重范围；若要求“写入后下一次模型必见”，应检查索引或prompt revision与实际供给。这个拆分来自表中的状态边界，不是一个系统总体优于另一个的排名。


## 源码定位

- [reme · reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)
- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [letta · src/agent/memory-format.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts)
- [letta · src/backend/local/system-prompt-compilation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)
- [letta · src/agent/memory-operation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-operation.ts)
- [letta · src/agent/memory-git.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts)
- [letta · src/agent/subagents/builtin/memory.md](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/subagents/builtin/memory.md)

## 自测

1. 为什么Letta文件读取能看到Rust，但本地system里仍可能是Python？
2. 为什么成功回执、内容hash和Git revision分别需要不同失败实验？
