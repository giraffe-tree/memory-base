---
id: projects.anthropic.context-management
title: 长期记忆、工具结果清理与 Compaction 怎样组成上下文供给？
summary: 对照 SDK 的工具循环和两种压缩请求，解释信息保存在外部、被读回与进入当前模型调用的不同完成点。
project: anthropic
minutes: 12
status: source_verified
prerequisites: [projects.anthropic.overview, foundations.start.context]
sources:
  - examples/memory/basic.py
  - src/anthropic/types/beta/beta_context_management_config_param.py
  - src/anthropic/types/beta/beta_clear_tool_uses_20250919_edit_param.py
  - src/anthropic/types/beta/beta_compact_20260112_edit_param.py
  - src/anthropic/types/beta/beta_compaction_config_param.py
  - src/anthropic/types/beta/message_create_params.py
  - src/anthropic/lib/tools/_beta_builtin_memory_tool.py
---

## 三个机制解决三个不同问题

固定 SDK `4c7b598466b88559583f98216139be8e9b34c1fc` 中，Memory Tool 把内容放到当前消息窗口之外；工具结果清理减少旧调用返回在有效上下文中的占用；Compaction 用压缩块替换较早会话。它们可以参与同一个长期任务，但不是一个存储层，也不代表同一种完成信号。

本页的本地工具循环与请求类型经过源码阅读；服务器如何生成摘要、实际模型是否保留约束，没有在本轮运行。Claude 聊天产品的主题记忆与 Claude Code 的 auto memory 是其他产品表面，不能从本 SDK 推导其全部内部实现。

## 沿一次跨会话任务追踪信息

假设第一会话决定“alpha 本周只改存储层”，Agent 把这条约束写入记忆文件。第二会话启动时，文件仍在，但不会仅凭文件存在就神奇地进入模型输入。应用需要指向同一存储，让模型得到目录线索并请求 `view`；工具结果返回后，约束才进入这次推理可用的上下文。

[`examples/memory/basic.py` 的消息循环](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/examples/memory/basic.py#L167-L231) 将 memory 对象交给 runner，记录 assistant 工具调用并取回 `generate_tool_call_response`，把结果加入后续消息。模型请求、应用执行、工具结果回送是三个步骤。`Memory.create` 成功意味着本地文件写入；正确回答还依赖后续读取、上下文和模型推理。

这个示例的 `/clear` 只重置进程维护的 messages；`/memory_clear` 则调用文件工具清空外部记忆。这是直观可读的状态分离证据：[命令处理](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/examples/memory/basic.py#L100-L118)。清空会话与删除长期记忆不是同一操作，后者也不应倒推出已有远端请求副本消失。

## 工具结果清理：配置服务端处理当前窗口

[`BetaContextManagementConfigParam`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/beta_context_management_config_param.py#L1) 包含清理旧工具结果、清理 thinking 与阈值压缩三种编辑类型。它是生成的参数声明，没有在客户端对本地 memory root 执行删除。

[`BetaClearToolUses20250919EditParam`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/beta_clear_tool_uses_20250919_edit_param.py#L1) 允许配置触发阈值、保留调用数量、最少清理量与排除工具。示例设置 30000 输入 token 触发、保留 3 次工具使用并排除 web_search，这是示例选择。不能把它写成所有模型、账户和应用的统一默认行为。

**推断**：在清掉长篇搜索结果前保留关键结论与来源，可减少后续重新搜索；若只保存结论而不保留证据线索，又可能让 Agent 无法核对更正。收益与损失需要同时测量，不能仅以窗口变短证明记忆更好。

## 当前有两种不同的 Compaction 请求

| 请求表面 | 何时触发 | 后续如何使用 | 本轮证据边界 |
| --- | --- | --- | --- |
| `context_management.edits` 中的 `compact_20260112` | 达到配置的输入阈值 | 可暂停于压缩后，由应用继续会话 | SDK 参数类型，不是服务端摘要实现 |
| 顶层 `compaction: {type: summarize}` | 应用显式发送压缩请求 | 只返回压缩块，后续放在 messages 开头替代被压缩历史 | SDK 契约与官方说明，无真实请求 |

阈值表面见 [`BetaCompact20260112EditParam`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/beta_compact_20260112_edit_param.py#L10)，其中允许 instructions、pause_after_compaction 和 trigger。按需表面见 [`BetaCompactionConfigParam`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/beta_compaction_config_param.py#L9)，它没有阈值和暂停标志。

[`message_create_params.py`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/message_create_params.py#L138-L158) 进一步注明：顶层 compaction 与 context_management 不能在该请求中并用。这里的类型是 `TypedDict`，不能把注释约束说成 Python 已在本地强制校验；实际请求还会经 API 处理。官方[压缩概览](https://platform.claude.com/docs/en/build-with-claude/compaction)截至本轮建议优先考虑可用的按需压缩，并说明服务端生成摘要。这仍不等于摘要会保存进 Memory Stores。

## 如何公平地评测这套设计

比较文件式 Agent 与固定一次向量搜索时，要记录文件 Agent 可以搜索或读取多少次、总输入 token、模型与停止策略。Letta 或 Anthropic 文件工具若允许主动追问、改写查询、反复读取，测到的是完整 Agent 路径，不只是存储检索算法。

至少分四个观察点：文件或远端 store 实际保存了什么；本次实际读取了什么；压缩、清理后下一次请求还包含什么；最终任务是否遵守约束。在同一故事里加入旧约束更正、一次性例外和无证据问题，才有机会区分“检索命中”“理解适用范围”“合理拒答”。

当前 SDK 提供的本地文件工具本身没有 LoCoMo 或 LongMemEval 成绩。官方上下文管理文章的内部实验属于特定 Agent 任务，不替代同条件的框架评测。本轮没有测得回答质量、成本、延迟或压缩损失，文档只提出可复现的验收切面。

## 自测

1. 为什么把旧工具结果清掉，不等于删除记忆文件，也不等于已经保存了摘要？
2. 同样回答正确，一次检索与十次主动读取的结果应该怎样记录才可比较？
