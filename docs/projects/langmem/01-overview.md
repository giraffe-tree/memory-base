---
id: projects.langmem.overview
title: LangMem 把记忆能力放在应用、模型和存储之间
summary: 区分进程内原语、LangGraph Store、反思执行器与可部署图，解释何时采用 LangMem。
project: langmem
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/langmem/knowledge/extraction.py
  - src/langmem/knowledge/tools.py
  - src/langmem/prompts/optimization.py
  - src/langmem/reflection.py
  - langgraph.json
  - src/langmem/graphs/auth.py
  - src/langmem/utils.py
---

## 结论与范围

LangMem 的核心是 Python 进程内的记忆操作和模型处理原语；它不自带一个必须使用的独立记忆数据库。应用提供消息、模型、命名空间和 LangGraph `BaseStore`，LangMem 决定怎样提取和修改记录，Store 负责实际保存、索引与搜索。固定版本为 `8620b986af5b0c7593e6b7fbece2998690d22d15`，核验日 2026-11-07。本文仅做源码核验，没有运行完整图、数据库或模型实验。

[MemoryStoreManager 的构造与 store 属性](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L832-L914) 能明确看到这条边界：传入 Store 时直接使用；否则从 LangGraph 执行上下文获取；两者都没有就抛错。选择 InMemoryStore、数据库适配器或远程 Store 会改变持久性和检索能力，不能把示例中的内存存储理解为框架只能保存到内存。

## 从“项目改用 Rust”看三条入口

假设助手此前记住 alpha 项目用 Python，用户后来决定改用 Rust。第一种入口是模型主动调用 `manage_memory` 工具：模型给出 create、update 或 delete，程序检查动作和 ID 后直接调用 Store。这里的模型调用由宿主 Agent 发起，工具函数本身没有再调用一个提取模型。[工具实现](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py#L263-L355)

第二种入口是应用在会话结束后调用 MemoryStoreManager。它先搜索有关旧记录，再把当前对话和既有记忆交给结构化提取器，形成新增、更新、删除，最后写回。是否把一次性讨论记为长期约束，取决于 schema、instructions、输入消息和模型结果。程序没有硬编码“最后一句话总覆盖过去”。[管理器主线](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L832-L914)

第三种入口是提示优化器。它分析轨迹和反馈，输出改进后的提示字符串，支持 gradient、metaprompt、prompt_memory。这个输出可以成为程序性经验，但将它保存到哪个配置、何时发布给 Agent，仍由应用安排；不能把生成字符串称为模型权重训练。[优化器接口](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/prompts/optimization.py#L50-L84)

## 状态究竟属于谁

| 状态 | 归属与责任 |
| --- | --- |
| 会话消息、checkpoint | 宿主图或应用；调用 LangMem 不自动备份完整原始会话 |
| 结构化记忆 | BaseStore 中 namespace 与 key 标识的 JSON 记录 |
| 索引、相似度与 TTL | 具体 Store 实现和配置，LangMem 通过接口转发 |
| 当前模型上下文 | 宿主把查询结果插入消息，或 Agent 读取工具结果 |
| 待处理反思 | 本地执行器的内存任务，或远程 LangGraph 服务的运行 |

[搜索工具](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py#L433-L497) 将 Store 返回内容序列化成工具结果，也可返回原始 artifact。它没有接管整个聊天回复。检索成功、材料进入上下文和最终回答正确是三个不同的验收点。

命名空间模板从 `configurable` 取变量；缺少变量会报 ConfigurationError。这是寻址机制，不能替代授权。若应用直接接受请求中的任意 user_id 作为配置，就可能读取到不属于请求者的 namespace。[NamespaceTemplate](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/utils.py#L73-L91)

## 本地库与服务部署不要混淆

ReflectionExecutor 根据 reflector 类型区分本地 Runnable 与远程图名称；后者使用 LangGraph SDK 提交远程运行。[工厂选择](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L110-L140) 仓库同时提供 `langgraph.json`，声明提取图、优化图、Store embedding 配置与认证钩子，说明这些原语可以部署为图服务；这不意味着安装 pip 包就自动开启 HTTP 服务。[部署清单](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/langgraph.json#L1-L18)

示例认证会把用户 identity 放入 Store namespace 前缀，线程按 owner 元数据过滤。这是该部署表面的隔离策略，不能外推为所有手工构造的进程内 Store 都已经有认证。[认证钩子](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/graphs/auth.py#L62-L80) 本轮没有确认独立 MCP 服务主线；LangChain StructuredTool 属于模型工具抽象，若要转成 MCP 仍需协议适配。

## 采用条件与边界

适合已经使用 LangGraph、希望自定义 schema 和存储、并愿意维护写入调度与上下文注入的应用。其价值是让记忆提取、提示优化与宿主运行时组合，而非交付一个所有治理策略都预设好的服务。

根据上述代码推断，代价主要在集成责任：应用需要自己保存来源、实现业务授权、处理并发更新和删除衍生状态。若需要完整审计链、可重放原始输入或跨多个后端的原子更新，应把这些作为选型附加要求验证。本轮没有测得准确率、延迟或 token 收益。

选型时还应区分“让模型主动选择记忆动作”和“应用每轮强制提取”。前者由 Agent 工具策略影响覆盖率，后者由宿主触发时机影响延迟与费用。两种路线可以组合，但先定义统一的存储 schema 和来源约定，避免各自写成不同格式后才发现无法相互更新。

## 自测

1. 调用 manage_memory 保存了 Rust，为什么不意味着原始聊天也已经被保存？
2. NamespaceTemplate 能防止缺参，但为什么不能自己证明请求者有权访问用户记忆？
