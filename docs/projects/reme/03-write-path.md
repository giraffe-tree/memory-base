---
id: projects.reme.write-path
title: 一段对话怎样变成可更新的 daily 笔记？
summary: 跟踪 AutoMemory 的校验、来源保存、Agent 工具调用、文件变更与成功请求回放。
project: reme
minutes: 11
status: source_verified
prerequisites: [projects.reme.memory-model]
sources:
  - reme/steps/evolve/auto_memory.py
  - reme/steps/evolve/auto_memory.yaml
  - reme/config/default.yaml
  - reme/components/agent_wrapper/as_agent_wrapper.py
  - tests/unit/test_auto_memory_idempotency.py
  - tests/unit/test_auto_memory_session_messages.py
---

## 写入不是一次数据库 insert

`auto_memory` 先处理输入与来源消息，再让 Agent 选择是否创建、更新或跳过笔记，最后补齐来源和变更信息。这个流程会写多个文件，也可能调用模型多轮；返回成功不能自动解释为“所有索引已经更新”或“整条链路具备事务提交”。

本篇核验 2026-11-04 的固定 commit `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9`。下面对测试的引用说明测试所表达的边界，本篇未运行这些上游测试，也未调用真实模型。

## 以一次语言选型讨论为例

调用方提交 `session_id=project-alpha`，消息为“先用 Python 做原型”。`AutoMemoryStep._execute` 把输入转换为 AgentScope `Msg`，校验 session ID，确定日记日期。即使 Job schema 给 session 字段保留了空默认值，实际执行仍拒绝缺少 session ID 的请求；参数描述不能替代代码检查。

接着 `_save_session_messages` 把消息保存至 `session/dialog/project-alpha.jsonl`。已有消息按消息 ID 合并、按时间排序；能维持原有前缀时走追加路径，否则重写。这层保留 ID 与时间很重要：调用方每次重试都生成新 ID，不能期待消息合并自动识别它们是同一句话。

保存时会移除 tool result 和 Base64 数据块，避免把检索回来的旧记忆再次伪装成用户提供的新事实。图像启用时另有附件保存和来源引用流程，默认 `include_images=false`。

## 创建与更新走不同工具集合

程序调用 `daily_list`，在指定日期的笔记中按 `session_id` 或来源链接查找关联笔记。没有命中时，Agent 仅获得创建工具 `daily_write`；已有笔记时，获得 `read`、`edit`、`frontmatter_update`、`write`，并通过注入的 `_allowed_paths` 限制到已解析的目标路径。

```text
输入校验与日期解析
  → 保存来源消息
  → 查当天 session 对应笔记
      ├─ 无笔记：Agent 判断是否有价值 → daily_write
      └─ 有笔记：read → edit / write → frontmatter_update
  → 检查实际文件、补来源、必要时重命名
  → 生成 changes、刷新 day index、返回 Response
```

提示词要求保留时间线，重写当前进度、卡点、下一步等状态段，其余内容合并去重。因此第二次消息“原型已完成，下一步压测”应更新当下状态，而不是把旧的“准备开始”仍当成当前情况。这是模型遵循的整理规则，不能当作程序已经验证每个事实的保证。

Agent 说“完成”还不是最后一步。新建后代码重新查找笔记；如果没有实际文件，可以成功返回 `path=None`、`modified=False`，代表跳过或未创建。更新后程序补齐 session 来源，根据 frontmatter 的 `name` 进行安全重命名，并比较文件字节判断是否修改。排障时应读 `metadata`，不能只看自然语言回答。

## 成功请求如何回放

可选 `request_id` 接受 1–128 字符。`execute()` 对 session、消息、日期、hint、图片开关组成的负载计算指纹，在 session 对应的 metadata 目录保存成功响应与 `changes` 回执。相同请求 ID、相同指纹可直接回放，避免再跑记忆 Agent；相同 ID 配不同输入被拒绝。

回执路径在进程内路径锁下检查与写入，临时文件写好后替换正式文件。失败请求不保存成功回执，允许重试。上游测试覆盖成功后新建 Step 回放、同进程并发重复请求等待、不同负载冲突等情况。

边界也很明确：笔记可能已经修改，但进程在成功回执落盘前退出。下一次重试仍可能重新执行 Agent；路径锁不等于跨进程分布式锁。默认 `auto_memory` Job 后面还会执行 `auto_tag_step`，AutoMemory 的回放也不意味着后续整个 Job 永不执行。这里提供的是成功请求的持久回放机制，不能扩写成任意失败下的 exactly-once。

## 写入完成以后还剩什么

`refresh_day_index` 刷新当天的笔记目录信息，不是等待 BM25 或向量索引完成。后者经文件监听链路更新；要确认新笔记搜索可见，需要继续检查索引处理状态或执行针对性等待。来源消息、笔记、标签、索引分别有失败边界，首批实验应观察每一步的实际产物。

## 源码定位

- [AutoMemory 实现](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)：`execute`、`_execute`、`_save_session_messages`。
- [创建与合并提示词](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.yaml)。
- [幂等回放测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_auto_memory_idempotency.py)：重点看失败重试和同 ID 不同负载。

## 自测

为什么 `success=True` 可能没有生成笔记？如果文件已经写好、回执尚未提交就崩溃，再次提交同一请求时还能保证 Agent 只运行一次吗？
