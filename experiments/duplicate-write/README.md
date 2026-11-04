---
id: experiments.duplicate-write
title: 重复提交一次记忆，怎样验证没有重复执行？
summary: 待运行方案：区分成功回执重放、失败重试、冲突输入及后续标签处理。
project: reme
minutes: 7
status: pending
prerequisites:
- projects.reme.write-path
- projects.reme.runtime-consistency
sources:
- tests/unit/test_auto_memory_idempotency.py
- reme/steps/evolve/auto_memory.py
- reme/config/default.yaml
---

## 当前状态：方案已写，实验未运行

本轮阅读了上游 `test_auto_memory_idempotency.py` 及对应实现，未安装完整 AgentScope 运行环境，未运行该测试或调用真实模型。以下是用于下一轮验证的输入与观察点，不是已观察结果。

源码支持的窄结论是：AutoMemory 对已成功完成的 request_id 保存回执；相同指纹可重放，同一完成 ID 用于不同输入应失败。Job 在该步骤之后仍有 `auto_tag_step`，所以步骤回放不等于整个 Job 没有后续工作。

## 合成输入

```json
{
  "request_id": "language-batch-001",
  "session_id": "alpha-language",
  "date": "2026-11-04",
  "messages": [{"id": "message-001", "role": "user", "name": "user", "content": "alpha 项目先用 Python；下周压测后再复评。", "created_at": "2026-11-04T10:00:00+08:00"}]
}
```

消息应先用实际 SDK schema 校验，避免把无效输入当成幂等实现缺陷。日期与 ID 是公开合成样本，不含私人记录。

## 分层运行

第一层在隔离工作区中替换 Agent 响应为可计数的受控函数，运行真实 `AutoMemoryStep.execute` 与回执存储逻辑，检查回放时是否再次调用该函数。上游已有这种测试结构，可先执行指定单元测试。

第二层在完整 Application 中运行默认 auto_memory Job，用受控 Agent 确保 daily 真正产生，观察后续标签步骤及索引变化。第三层才使用真实模型，验证同一输入在完整部署中的表现，并记录模型、提示、配置、token 和调用次数。

## 样本与预期

| 场景 | 要核验的契约 | 必须观察 |
| --- | --- | --- |
| 首次成功后相同批次重试 | 可重放完成回执 | 响应、Agent调用次数、笔记与回执文件 |
| 新 Step 实例重放 | 回执不只在对象内存 | 文件加载、响应一致性 |
| 相同 ID 换消息 | 完成ID不能指向另一输入 | 失败信息，旧内容是否保留 |
| 首次返回业务失败后重试 | 失败不作为完成回执 | 能否再执行，是否遗留部分文件 |
| 同一应用并发相同批次 | 进程内锁协调 | 调用次数、等待与返回顺序 |
| 工具写入后、回执前中断 | 不能预设全局原子性 | 重启后重复副作用与人工恢复方式 |

最后一行需故障注入，不应直接杀死共享服务。多进程场景应另做实验，不拿同一事件循环内的 asyncio 并发代替。

## 复现入口与验收

安装上游要求的 Python 环境后，从 `refernece/ReMe` 执行：

```bash
pytest tests/unit/test_auto_memory_idempotency.py -v
```

这是下一步命令，本轮没有执行。最终结果应同时记录原始输入、每次响应、工作区变化、调用计数、重启方式和失败点，再将页面状态改为实验验证。


## 源码定位

- [tests/unit/test_auto_memory_idempotency.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_auto_memory_idempotency.py)
- [reme/steps/evolve/auto_memory.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)
- [reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)

## 自测

1. 一次成功返回却没有笔记，怎样区分合理 skip 与写入失败？
2. 为什么“第二次没有调用记忆 Agent”不能证明标签或其他步骤没有运行？
