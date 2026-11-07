---
id: projects.anthropic.overview
title: Anthropic 的记忆工具、托管记忆与上下文压缩分别运行在哪里？
summary: 沿官方 Python SDK 区分应用执行的 Memory Tool、Managed Agents Memory Stores、会话同步与服务端上下文管理。
project: anthropic
minutes: 14
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/anthropic/tools/memory.py
  - src/anthropic/lib/tools/_beta_builtin_memory_tool.py
  - src/anthropic/lib/tools/_memories.py
  - src/anthropic/resources/beta/memory_stores/memory_stores.py
  - src/anthropic/resources/beta/memory_stores/memories.py
  - src/anthropic/types/beta/beta_managed_agents_memory_store.py
  - src/anthropic/types/beta/message_create_params.py
  - examples/memory/basic.py
---

## 结论与核验范围

Anthropic 不是只有一种记忆设计。本轮固定官方 `anthropic-sdk-python` 的 `4c7b598466b88559583f98216139be8e9b34c1fc`，于 2026-11-07 阅读：应用内文件工具、托管 Memory Stores HTTP 客户端、自托管 worker 的文件同步、上下文压缩请求类型。这里只能核验开放的客户端与本地实现，没有调用付费 API，没有读到托管服务的数据库、检索或模型调度内部实现。

因此，“Anthropic 记忆全部保存在自己的应用”只对 Messages Memory Tool 的自持实现成立；当前 SDK 已经包含另一套托管 Memory Stores 表面。反过来，发现 Memory Stores API 也不能把文件工具说成云数据库代理。

## 四条调用链与状态归属

| 表面 | 谁执行 | 持久状态在哪里 | 代码能证明的范围 |
| --- | --- | --- | --- |
| Messages Memory Tool | 模型生成工具请求，应用执行 handler | 本地默认文件或自定义后端 | 命令分派、文件操作、路径与错误处理 |
| 托管 Memory Stores | SDK 发送 HTTP，远端服务执行 | Workspace 范围的服务端 store | API 契约与请求序列，不是服务端算法 |
| 自托管环境的 Memory Stores | worker 下载文件，工具读写副本，SDK 同步 | 远端 store 加本地工作副本 | 客户端合并、冲突与删除保护控制流 |
| Context management / compaction | 应用发送配置，API 处理当前会话 | 会话输入与压缩块 | 请求类型、返回块使用约定；不是长期记忆库 |

第一条从 [`BetaAbstractMemoryTool.to_dict/call/execute`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L56-L164) 出发：工具声明为 `memory_20250818`，`execute` 将模型请求分派到六种方法。默认 [`BetaLocalFilesystemMemoryTool`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L387-L411) 把 `/memories` 映射到 `base_path/memories`，构造默认 `base_path='./memory'`。这里没有在 `create` 内部再调用 LLM 自动提取事实；模型在发起工具调用以前已经选择了内容。

第二条由 [`MemoryStores.create`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/resources/beta/memory_stores/memory_stores.py#L74) 与 [`Memories.create/update`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/resources/beta/memory_stores/memories.py#L53) 发出远端请求。生成类型 [`BetaManagedAgentsMemoryStore`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/types/beta/beta_managed_agents_memory_store.py#L10) 记录 store ID、名称、描述、metadata 和归档状态。[创建接口注释](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/resources/beta/memory_stores/memory_stores.py#L103-L109)说明描述会进入 Agent 提示，metadata 用于调用者管理，Agent 不可见；这不等于 metadata 已经实现业务租户授权。

第三条的客户端实现 [`SessionMemoryStores`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L163) 保存内容 hash 基线，把本地文件变化与远端 store 对齐。它不同于直接在本地目录构造 Memory Tool，也不同于“本地文件实时挂载到云端”。

## 用同一段项目约束理解三种状态

假设用户说“alpha 暂用 SQLite”。Messages 路径需要模型决定记到哪个文件，调用 `create` 或 `str_replace`，应用成功执行后文件才变化。下一次会话还必须使用同一个存储目录，并让模型读取相关文件，才能利用这条知识。仅启用工具并不证明每条消息都被保存。

Managed Agents 路径则需要创建并为 session 配置 store。官方[Memory Stores 说明](https://platform.claude.com/docs/en/managed-agents/memory)描述：云环境通过目录访问 store；自托管环境先下载副本再同步。store 的描述与路径帮助 Agent 发现记忆，文件正文仍需读取。这里的目录是工具可访问的表面，不证明后端物理存储也是普通文件系统。

若随后“alpha 改用 Postgres”，文件工具提供的是精确文本修改原语，语义上是否覆盖旧事实由 Agent 决定。托管客户端增加了版本与条件更新表面，但并不因此自动解决两句话究竟是更正、计划还是临时例外。

## 接口协议不应混为一层

Memory Tool 是模型工具调用契约，Python handler 可以在进程内运行。Memory Stores 是 SDK 发起的 HTTP API。自托管 worker 负责文件副本与远程服务同步。MCP 是可用于另外封装工具的协议，本轮上述路径不要求先建立 MCP Server。

[`examples/memory/basic.py`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/examples/memory/basic.py#L79) 将本地 memory 对象交给 tool runner，并维护消息与工具结果。其系统提示鼓励保存事实、偏好和及时更正，这是示例策略，不是 SDK 强制执行的记忆质量规则。该例还有上下文清理配置，不能把示例的触发值当作所有应用默认值。

## 设计价值、代价与采用条件

源码体现出的价值是职责清楚：模型决定信息与组织方式，工具执行可审计的操作，应用或托管平台承担持久化，当前上下文另行管理。对已有文件工作流的 Agent，这可以直接复用读写、目录与文本编辑能力。

相应代价是质量依赖模型和提示。文件工具没有在这条路径中提供事实唯一 ID、全局实体归一、自动失效时间或语义冲突裁决。需要这些能力时，应在自定义 backend、治理流程或检索组件中实现，并重新验证。不能从默认实现未提供某项功能推出 Anthropic 模型或工具协议不支持扩展。

**推断**：对个人记忆系统，可先用文件式工具建立可观察基线，再判断是否需要事实提取服务或时序图。对多写入者的托管协作，还要单独验证版本冲突、同步丢失响应和删除后重建；单个工具写成功不是全系统一致性的完成点。

## 自测

1. 为什么本地调用 Python SDK 既可能操作自己的文件，也可能请求 Anthropic 托管 store？
2. 哪些证据支持“客户端实现可读”，哪些仍只支持“服务端接口公开”？
