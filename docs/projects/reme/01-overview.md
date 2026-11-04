---
id: projects.reme.overview
title: ReMe 在 Agent 系统中负责哪一段？
summary: 从宿主、Application、Job 和记忆文件的边界开始，追踪写入与读取的两条链路。
project: reme
minutes: 9
status: source_verified
prerequisites: [foundations.start.reme]
sources:
  - reme/application.py
  - reme/config/default.yaml
  - reme/components/agent_wrapper/as_agent_wrapper.py
  - reme/components/job/base_job.py
  - reme/schema/application_config.py
---

## 先回答问题

ReMe 是围绕工作区文件组织记忆的应用运行时。它接收对话或资料，调用整理 Agent 生成笔记，维护检索用的派生状态，并通过 Job 把查询与文件操作提供给调用方。宿主仍需决定什么时候提交经历、什么时候查询记忆，以及把结果放进哪一次模型调用。

本篇基于 `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9` 的源码核验，核验日期为 2026-11-04。这里的调用链已静态追踪；未运行真实模型端到端测试。

## 从一次项目协作看边界

假设用户说：“项目先用 Python，等压测结果出来再决定要不要改 Rust。”宿主把消息和稳定的 `session_id` 交给 `auto_memory`。ReMe 保存来源会话，再让记忆 Agent 判断值得记录的事实，使用文件工具创建或更新当天笔记。后台索引任务随后处理笔记变化。

几天后用户问：“这个项目最终用什么语言？”宿主需要发起 `search`，必要时再 `read`，并把返回材料交给实际回答问题的模型。ReMe 的检索接口不等于最终回答接口，创建了笔记也不等于任何聊天宿主都会自动使用它。

```text
外部宿主 / CLI / HTTP / MCP
          ↓ 调用 Job
Application：配置、组件、服务与生命周期
          ↓
auto_memory → 记忆 Agent → daily_write / edit → daily 文件
          ↓ 文件变化
index_update_loop → 分块 / 图 / BM25 / 可选向量
          ↑
search / read → 来源片段 → 宿主选择并组织上下文
```

## 四层职责怎样连接

`Application.__init__` 先经插件运行时解析配置，创建 `ApplicationContext`，建立工作区目录，再实例化服务、组件和 Job。组件按类型与名称放在应用上下文；每个配置中的 `backend` 由注册表解析成实际类。配置不是一份被动说明书，它决定哪些服务、存储和流程真正参与运行。

Job 是可调用的流程入口，Step 是流程中的处理步骤。`BaseJob` 在启动时解析步骤类，每次执行创建新的 Step 实例，因此 Step 的实例字段不能被当作跨请求持久记忆。一次执行共享 `RuntimeContext`；索引、文件图等长生命周期组件则由应用管理。

模型参与的是需要语义判断的部分，例如从对话中提炼事实、决定如何合并笔记。文件读写、路径校验、索引更新和结果格式化由程序执行。默认 AgentScope wrapper 的 `_make_tool` 把 Job 包成 `FunctionTool`：模型提出调用，闭包调用 `job(...)`，再把 `Response.answer` 转为工具结果。这条内部路径是进程内异步调用，不因“工具”这个名字就自动经过 HTTP 或 MCP。

HTTP、MCP 是另一层接入表面。默认配置启用 HTTP service，并启用其 MCP 入口；应用也提供 CLI 服务和其他调用方式。外部协议把请求送进相同的 Job 机制，并不改变笔记和索引的职责归属。

## 当前默认配置说明了什么

默认工作区是 `.reme`，但初始化时会展开为绝对路径。配置为 session、resource、daily、digest 和 metadata 分配各自目录。`index_update_loop` 监听 daily 与 digest 的 Markdown，`resource_watch_loop` 处理导入资料，Dream 定时任务负责进一步整理长期知识。

默认检索配置明确把 `embedding_store` 设为空字符串，启用 BM25、文件图和标签索引。因此当前默认部署不能描述成“每次查询都在做向量混合检索”。`SearchStep` 具备混合能力与默认配置实际运行的分支，是两个层次的事实。

## 采用时应先确认的边界

“文件在本地”只说明内容和部分状态的存放方式，不保证语义处理完全离线。实际模型调用是否发往远端，取决于所选 wrapper、模型适配器与配置。外部宿主的用户授权、会话切分和信息提交时机，也不会因接入一个记忆服务而自然解决。

这一版本可提供可读文件、检索与维护工作流；是否适合某个产品，还需核验宿主接入、访问控制、故障恢复及真实记忆质量。阅读本手册时，要把框架可配置的能力、默认启用的能力和已经实测的行为分别看待。

## 源码定位

- [Application：装配、依赖与生命周期](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)：`__init__`、`_instantiate`、`_topological_order`。
- [默认配置](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)：服务、Job、索引与 wrapper。
- [Job 执行](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/job/base_job.py)与[AgentScope 工具桥接](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py)：`_make_tool`。

## 自测

试着解释：模型说“写一条笔记”以后，究竟是谁落盘？同一个 `search` Job 经 MCP 被外部宿主调用，与作为进程内 Agent 工具被调用，差别发生在哪一层？
