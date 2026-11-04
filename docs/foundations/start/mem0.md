---
id: foundations.start.mem0
title: Mem0 怎样把对话变成可查询的记忆？
summary: 先区分开源 Memory 与托管 MemoryClient，再理解当前 ADD-only 自动写入与显式更正。
project: mem0
minutes: 5
status: source_verified
prerequisites:
- foundations.start.memory
- foundations.start.reme
sources:
- mem0/memory/main.py
- mem0/configs/base.py
- mem0/memory/storage.py
- mem0/utils/scoring.py
- mem0/client/main.py
---

## 先区分两种调用

`Memory` 和 `AsyncMemory` 在应用中运行开源记忆逻辑，通过所选模型与向量存储持久化记忆。`MemoryClient` 和 `AsyncMemoryClient` 则是托管服务的 HTTP 客户端：能读到请求组织方式，不意味着能看到服务端全部实现。

本手册先研究固定 commit `ed1f10fc8708` 的 Python OSS 主线。REST 包装器和 TypeScript SDK 是额外表面，需要分别核验，不能凭同名 API 假设语义完全一致。

## 从一句决定开始

你提交“alpha 项目先用 Python 做原型”，并显式提供 user、agent 或 run 作用域。默认推断路径先读同 scope 最近十条缓存消息，检索十条相关旧记忆，再把这些材料和新对话交给模型。当前提取提示与代码走 ADD-only：提取新事实、生成 UUID，保存文本 payload 与 embedding。

这与 ReMe 创建可读 daily 笔记的载体不同。Mem0 主记忆保存在向量 store 的 payload 中；SQLite 保存变更历史和最近消息。最近十条消息只是提取辅助，不是完整来源会话归档。

## “只追加”不等于“不能修改”

当前自动 `add(infer=True)` 不再让模型选择 UPDATE／DELETE 操作。但显式 `update(memory_id, text=...)` 和 `delete(memory_id)` 仍然存在。宿主若要求把旧决定替换成新状态，需要决定是追加带时间的事实，还是明确调用更正接口。

因此“新决定改用 Rust”并不会因为提交了 add，就自动证明旧的 Python 事实已经被替换或撤销；语义正确仍需实测。代码里遗留的一些 docstring 仍描述旧 CRUD 流程，读源码时应以实际控制流为准。

## 下一次如何使用

`search` 要求在 `filters` 中放至少一个 user、agent 或 run 标识，当前版本拒绝这些顶层参数。查询向量先产生候选，关键词和实体信号为候选加分，再返回记忆项与可选分数解释。宿主负责把选中结果供给本次模型输入。

默认 provider 选择为 OpenAI 模型／embedding 和 Qdrant store；具体连接和模型配置可替换。实体能力依赖 NLP 组件，关键词能力依赖 store 支持。这些是可配置实现，不代表本轮已启动对应模型和数据库。

## 接着怎么读

先读 [Mem0 系统边界](../../projects/mem0/01-overview.md)，再沿写入、存储、检索走完整条链。读完两个项目后，可以从 [架构对照](../../comparisons/architecture-map.md) 检查同名“记忆”背后的不同状态归属。


## 源码定位

- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/configs/base.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/base.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)
- [mem0 · mem0/utils/scoring.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)
- [mem0 · mem0/client/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py)

## 自测

1. Memory 与 MemoryClient 的逻辑分别运行在哪里？
2. 自动写入只追加，为什么仍可能需要显式 update？
