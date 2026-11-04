---
id: foundations.start.agent
title: Agent 到底怎样完成一件事？
summary: 模型提出行动，宿主执行工具，再把观察带回下一次推理。
project: reme
minutes: 4
status: source_verified
prerequisites: []
sources:
- reme/components/agent_wrapper/as_agent_wrapper.py
- reme/components/job/base_job.py
---

## 从一次回答，到一段行动

模型可以回答“如何记录项目决定”，也可以提出一次 `daily_write` 工具调用。后者还需要程序校验参数、解析路径、写入文件，并把成功或错误结果交回。模型输出工具请求与文件真正落盘，是两件发生在不同位置的事。

Agent 是围绕模型组织起来的行动循环。用户给出目标，模型基于本次上下文选择下一步，宿主执行允许的工具。观察回来以后，模型可能继续行动，也可能结束。一轮任务可能包含多次模型调用。

## ReMe 中谁执行工具

`AsAgentWrapper._make_tool` 把一个 ReMe Job 包装成 AgentScope 的 `FunctionTool`。包装函数调用 Job，把 `Response.success` 转换成工具状态，把 `answer` 放进工具结果。若 Job 与 Agent 在同一应用中，这条路径可以是进程内的异步函数调用。

HTTP 客户端调用服务、MCP 客户端调用工具，则跨越另外的协议边界。看到“模型调用工具”不能据此认定一定发生 HTTP 请求；需要找到实际工具适配器。

## 用一次记录任务理解

你说“今天决定暂用 SQLite，下一轮压测再评估 PostgreSQL”。记忆 Agent 判断哪些内容值得保存，调用写入 Job。程序操作工作区文件，再将结果送回 Agent。模型应该表达“已记录决定”，不应把一次写入误报成“已完成数据库迁移”。

## 边界

有工具不代表有无限权限。工具集合、工作区边界、宿主许可与后端执行能力共同决定实际行为。上面的流程说明了程序结构，不证明每次模型都会选对工具。


## 源码定位

- [reme/components/agent_wrapper/as_agent_wrapper.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py)
- [reme/components/job/base_job.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/job/base_job.py)

## 自测

1. 模型给出一个文件路径，与文件确实存在，中间还差什么？
2. 在同一进程运行的 Job 和通过 MCP 暴露的 Job，哪些职责相同，哪些边界不同？
