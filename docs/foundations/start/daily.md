---
id: foundations.start.daily
title: 一段对话怎样变成 daily 笔记？
summary: 来源会话保留材料，daily 由记忆 Agent 整理；request_id 与 session_id 承担不同职责。
project: reme
minutes: 5
status: source_verified
prerequisites:
- foundations.start.files
sources:
- reme/steps/evolve/auto_memory.py
- reme/steps/evolve/auto_memory.yaml
- tests/unit/test_auto_memory_idempotency.py
---

## 不是简单复制最后一句话

一段讨论里可能先选 PostgreSQL，后来决定先用 SQLite，最后约定下一次压测复评。daily 应记录决定、原因和待办，不能把讨论中的备选方案写成已经完成的事实。

`AutoMemoryStep` 准备消息和日期，保存来源会话，寻找关联 daily，再交给 Agent 整理。创建路径提供 `daily_write`，更新路径允许先读再改。提示词要求保留重要事实与关键数字；这表明设计意图，不能代替模型质量评测。

## 两种 ID，两个目的

`session_id` 标识来源会话，用于关联 `session/dialog/<id>.jsonl` 和 daily。`request_id` 则标识一次提交批次：当前实现会根据输入形成指纹，成功后持久化响应与变化信息。完成的相同请求可以重放回执，不再执行记忆 Agent；已完成 ID 配不同输入会失败。

回放跳过的是 AutoMemory 记忆 Agent；默认 Job 后续的 `auto_tag_step` 仍会执行。这解决的是成功后客户端超时重试等场景。它不是按自然语言去重，也不表示整个工具副作用与回执处于同一个数据库事务。首次调用失败或回执落盘前中断，仍需要具体检查失败点。

## 来源不是完整无损归档

`_sanitize_msg_for_save` 会移除工具结果与 Base64 数据块，避免检索回来的材料又被伪装成新的用户经历。启用图片路径时还有独立的附件保存和来源标注流程。因而来源文件保留什么，要看消息准备与清洗，不能直接叫“所有输入的逐字副本”。

## 写完以后

daily 变化会进入标签或索引相关处理，默认应用也有文件监听任务。内容落盘与检索可见并不是同一项成功条件。宿主若直接修改来源对话文件，也不能据此断言 AutoMemory 已重新执行。


## 源码定位

- [reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)
- [reme/steps/evolve/auto_memory.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.yaml)
- [tests/unit/test_auto_memory_idempotency.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_auto_memory_idempotency.py)

## 自测

1. 同一 session 的下一批新消息，应怎样理解 session_id 与 request_id 的关系？
2. 成功回执能证明什么，不能证明哪种失败恢复保证？
