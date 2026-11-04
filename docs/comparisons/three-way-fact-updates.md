---
id: comparisons.three-way-fact-updates
title: 新决定、整理和遗忘，在三套系统里分别意味着什么？
summary: 对照来源水位、显式事实更新、MemFS版本与reflection admission；不用成功文案替代内容和传播证据。
project: comparison
projects:
- reme
- mem0
- letta
minutes: 11
status: source_verified
prerequisites:
- projects.reme.updates-forgetting
- projects.mem0.updates-forgetting
- projects.letta.updates-forgetting
sources:
- project: reme
  path: reme/steps/evolve/dream/integrate.py
- project: reme
  path: reme/steps/evolve/dream/finish.py
- project: reme
  path: reme/config/default.yaml
- project: reme
  path: reme/steps/file_io/delete.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/memory/storage.py
- project: letta
  path: src/backend/local/system-prompt-compilation.ts
- project: letta
  path: src/backend/api/reflection-runs.ts
- project: letta
  path: src/agent/reflection-runs.ts
- project: letta
  path: src/agent/memory-git.ts
- project: reme
  path: reme/steps/evolve/auto_memory.py
- project: letta
  path: src/backend/local/local-store.ts
---

## 把目标与机制分开

同一目标是“当前采用Rust，仍可解释曾试用Python”。这不要求抹掉过去，也不必强制追加或覆盖同一种载体。三个项目的更正和整理机制由下表支持，基线分别为ReMe d323356、Mem0 ed1f10f、Letta Code e6d6cc2；所有链接使用完整固定SHA。

| 问题 | ReMe证据 | Mem0证据 | Letta证据 |
| --- | --- | --- | --- |
| 新事实 | daily可更新，Dream整合长期知识。 [AutoMemoryStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py) [DreamIntegrateStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py) | 自动add只ADD；显式update改变指定ID。 [_add_to_vector_store / _update_memory](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 编辑MemFS，已提交root内容供本地prompt；工作树与投影分离。 [collectCommittedMemoryFiles](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| 整理完成 | Finish按成功来源和扫描时版本提交水位。 [DreamFinishStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py) | 显式API后的history不是按日期扫描水位。 [SQLiteManager.add_history](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py) | Cloud reflection请求queued/no_work是admission回执，不证明完成。 [postReflectionRun](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/reflection-runs.ts) |
| 整理归属 | 默认cron配置Dream并有扫描窗口。 [dream_cron / auto_dream](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml) | 所读OSS主链没有相同Dream cron；不能移植托管描述。 [Memory](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | localMemfs、config=null、cutover=false或预检APIError404允许客户端路径；缺失cutover抛错，true走Cloud请求。 [requestCloudReflectionRun](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts) |
| 遗忘范围 | 删除来源不自动获得digest事实级级联撤销。 [DeleteStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/delete.py) | 主记录delete后history仍可保留old_memory。 [_delete_memory](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | 从当前树移除不等于历史Git、transcript或远程副本抹除。 [LocalStore状态路径](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts) [Git版本与同步路径](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts) |


## 不根据Dream这个词画等号

ReMe的默认Dream链由Extract、Integrate、Finish等步骤组成，扫描窗口和水位有明确本地状态。Mem0当前OSS普通add并没有同样的默认定时整理链，这个“未见”限定在所读主实现范围，不是对所有托管能力的否定。

Letta当前代码有客户端worktree reflection，也有Cloud admission。[requestCloudReflectionRun](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts) 在localMemfs、config=null、cutover=false以及预检APIError404场景返回null，允许现有Code-managed路径；缺失cutover会抛错，其他错误不自动回退，cutover=true才进入Cloud请求。因此不能说所有/dream入口都仅能本地执行，也不能因Cloud专用函数拒绝local就说所有客户端reflection被禁用。

## 排队不是整理成功

[postReflectionRun](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/reflection-runs.ts) 发送conversation_id，禁用隐式重试并设置30秒超时。它接受202 queued加run_id，或200 no_work。`formatReflectionReceipt` 把queued显示成“Dreaming...”，这表示已排队而不是知识已完成整合。

比较时分别收集ReMe来源水位和digest、Mem0目标ID与history、Letta对应memory commit／整合结果或Cloud后续完成状态。若只有请求回执，仅能确认排队或本次无任务，不能证明新知识已经整合。

## 删除后的观察面

让当前搜索不命中、从当前文件移除、保留可审计历史和彻底清除内容，是不同验收要求。Mem0的DELETE history有意保留旧文本；Letta的Git版本意味着移除当前文件并不能证明旧commit不可读；ReMe的来源和digest也需要分别追踪。

这里没有测试任何云端或多副本删除传播。关于Letta历史保留的判断仅限所读Git版本模型，不宣称已审计Cloud保留策略或备份清理。真正需要清除时，应逐项列出当前载体、历史、会话、远端和备份，并明确产品要求。

## 下一步的共同实验

固定公开输入与模型，分别在“新状态已写，后续history／水位／Git整合未确认”时故障注入。记录第一次返回、文件或记录差异、重启可见状态和下一轮供给。没有这些观测前，不把prompt要求、整合动作名称或成功文案视为质量保证。


## 源码定位

- [reme · reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [reme · reme/steps/evolve/dream/finish.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py)
- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [reme · reme/steps/file_io/delete.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/delete.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)
- [letta · src/backend/local/system-prompt-compilation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)
- [letta · src/backend/api/reflection-runs.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/reflection-runs.ts)
- [letta · src/agent/reflection-runs.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/reflection-runs.ts)
- [letta · src/agent/memory-git.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-git.ts)

- [reme · reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)

- [letta · src/backend/local/local-store.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/local-store.ts)

## 自测

1. 为什么Letta显示Dreaming仍不足以证明新决定已经进入下一次上下文？
2. 为什么从当前树删掉事实，不等于清除了它在历史和来源中的所有痕迹？
