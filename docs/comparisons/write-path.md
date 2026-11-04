---
id: comparisons.write-path
title: 同一段对话，两套系统怎样写入与重试？
summary: ReMe 的请求回执与 Mem0 的内容hash解决不同问题；分别追踪来源、提取、落盘和部分失败。
project: comparison
projects:
- reme
- mem0
minutes: 10
status: source_verified
prerequisites:
- projects.reme.write-path
- projects.mem0.write-path
sources:
- project: reme
  path: reme/steps/evolve/auto_memory.py
- project: reme
  path: reme/steps/evolve/auto_memory.yaml
- project: reme
  path: reme/config/default.yaml
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/memory/storage.py
- project: mem0
  path: mem0/configs/prompts.py
- project: reme
  path: tests/unit/test_auto_memory_idempotency.py
---

## 先看被重复的究竟是什么

ReMe 可用 request_id 识别一次成功提交批次，重放持久回执，避免再次执行 AutoMemory Agent。Mem0 当前 infer=True 写入使用提取文本的 MD5，与本次取回的旧记忆及本批文本比较，减少内容重复。一个识别请求批次，一个识别精确文本，不能统一叫作 exactly-once。

比较基线为 ReMe `d323356e6f11` 与 Mem0 `ed1f10fc8708`。本页是源码核验；没有同时运行两套写入链路或真实模型。

## 相同输入，分别映射身份

公开合成输入：消息 m1，“alpha 项目先用 Python，压测后复评”；再次提交同一批消息，然后提交 m2，“现在改用 Rust”。ReMe 为来源设置稳定 session_id，并为每个提交批次选择 request_id；Mem0 为项目／用户设置明确的 user、agent、run scope，把业务消息内容交给 add。

这些字段不是可以直接互换的标识。ReMe session_id关联来源文件，request_id关联批次回执；Mem0 scope限定记忆和最近上下文，但当前 add接口没有相同语义的request_id成功回放参数。宿主可以自己增加请求台账，不过那是宿主实现，不是本轮研究的内置保证。

## 两条写入链路

| 步骤 | ReMe | Mem0 infer=True |
| --- | --- | --- |
| 准备材料 | 校验session和日期，清洗并保存来源消息 | 规范scope，读取最近十条消息缓存 |
| 读取旧内容 | 按日期和session查关联daily，更新时Agent可读目标 | 嵌入新对话，检索十条相关旧记忆作为提取背景 |
| 模型判断 | 创建／更新工具，可能多轮或skip | 一次ADD-only提取，解析memory数组 |
| 内容落盘 | 文件工具写daily，补来源与变更信息 | 事实batch embedding、文本hash检查、新UUID和payload批量插入 |
| 后续状态 | 成功回执、标签、索引等有各自处理时点 | history、实体链接和最近消息缓存分步维护 |

Mem0批量embedding或insert失败时有逐条回退；只把代码确认已插入的记录用于返回与后续处理。部分记录失败不等于整个批次原子回滚；history或实体链接也存在独立失败路径。ReMe的多工具文件副作用同样不能凭一次Job响应获得全局回滚。

## 重复提交的实际边界

ReMe回执校验相同request_id与输入指纹；用同一个完成ID提交m2会被拒绝，因此新的业务批次应使用新的request_id。成功回放跳过AutoMemory Agent，但默认Job后面的auto_tag仍执行；笔记已写、回执尚未保存就中断时，也可能再次进入Agent。

Mem0的existing_hashes仅来自先前检索的十个结果，而不是全scope完整去重索引。相同事实若没有进入那十个旧候选，不能由这段检查证明必被去重；不同措辞的相同含义也不会因为MD5自动合并。`infer=False`直接逐消息创建记录，跳过这套自动提取与hash去重分支。

SQLite `save_messages`也会追加同内容消息。本轮局部实验向beta scope保存相同内容两次，读取到两条；这只证明缓存写入行为，不是完整add重试实验。

## “成功但没有新记忆”怎么解释

ReMe可能合理skip，返回path为空且modified为false。Mem0可能提取为空、解析失败转空、全部hash重复，返回空results；外部LLM调用异常在当前代码中会抛错，不能把所有空列表都归为模型不可用。

验收应记录输入、每次响应、来源或缓存、文件或payload、调用次数、history与索引可见性，再判断究竟是跳过、去重、部分成功还是失败。只统计API成功次数会掩盖这些差别。

## 共同实验下一步

固定模型和配置，用同一故事分别测：首次成功后客户端重试、不同负载误用同批次ID、工具／主store写入后下游状态失败、跨进程并发重复提交。ReMe上游幂等测试已提供部分受控样本；Mem0还需要围绕实际store与返回状态设计样本。读过测试与方案均不冒充本轮已运行。


## 源码定位

- [reme · reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)
- [reme · reme/steps/evolve/auto_memory.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.yaml)
- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)
- [mem0 · mem0/configs/prompts.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/prompts.py)
- [reme · tests/unit/test_auto_memory_idempotency.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_auto_memory_idempotency.py)

## 自测

1. 为什么request_id回执和文本hash不能相互替代？
2. Mem0某条旧记忆没进前十候选时，能否用当前hash逻辑保证没有重复记录？
