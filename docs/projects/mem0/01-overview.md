---
id: projects.mem0.overview
title: Mem0 是记忆服务，还是宿主里的一个库？
summary: 区分 Python OSS Memory、异步接口与托管客户端，再沿当前 v3 的新增和检索链路定位系统边界。
project: mem0
minutes: 9
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - mem0/memory/main.py
  - mem0/configs/base.py
  - mem0/client/main.py
  - mem0/configs/prompts.py
  - mem0/utils/scoring.py
---

## 结论与研究范围

同一个 Mem0 名称下有不同执行位置。Python OSS 的 `Memory` 在调用进程内装配模型、embedding、vector store 与 SQLite；`AsyncMemory` 提供异步入口。`MemoryClient` 则通过 HTTP 请求托管平台，本仓库可看到请求与响应契约，不能据此读到托管后端的全部实现。

本页核验固定 commit `ed1f10fc87080f0b67f99be370817504888462ab`，核验日期为 2026-11-04。主线跟踪 Python OSS，其他语言及 REST 服务作为接入表面；没有运行真实模型与托管账户实验。

## 先用一次跨会话任务划清责任

假设用户第一次说“alpha 项目先用 Python”，第二次问“部署镜像需要准备什么”。宿主调用 `Memory.add` 提交第一段材料，后续用带作用域的 `Memory.search` 取回候选，再把返回文本组织进回答模型的输入。

Mem0 不因初始化 SDK 就自动读取所有聊天，也不自动把任意宿主的每轮请求接入记忆流程。消息何时提交、用户身份怎样获得、返回结果怎样进入模型上下文，仍由宿主负责。即使一次 search 正确命中，也需要观察后续实际模型请求，才能证明记忆已经生效。

| 表面 | 代码里的执行位置 | 本轮能核验的范围 |
| --- | --- | --- |
| `Memory` | 调用方 Python 进程 | 模型抽取、记录写入、检索与显式更新 |
| `AsyncMemory` | 调用方事件循环与线程调度 | 异步流程代码；不等于所有 provider 都是原生异步 |
| `MemoryClient` / `AsyncMemoryClient` | HTTP 客户端连接托管 API | 参数准备、端点、错误与响应转交 |
| TypeScript OSS / REST server | 仓库中的其他包 | 独立实现与部署入口，不能默认与 Python 行为相同 |

## 当前新增链路已经改变

本次基线的 `_add_to_vector_store` 使用 `ADDITIVE_EXTRACTION_PROMPT`：先取本作用域近期消息和相关旧记忆，一次模型调用提取新事实，再批量 embedding、去重、新建 UUID、写入记录和历史，最后辅助实体关联。

这条常规 `infer=True` 路径是 ADD-only。旧记忆用作消歧、去重与上下文，不再通过第二次 LLM 决策自动执行旧版 ADD、UPDATE、DELETE 分类流程。源码的部分 docstring 和上游指南仍出现旧描述，应以可执行分支为准。显式 `update`、`delete` 接口仍存在；“抽取只新增”不等于“库不能修改”。

```text
宿主提交消息与 scope
  → 近期消息 + 相关记忆 → ADD-only 抽取
  → embedding → 局部哈希去重 → 新记忆记录
  → SQLite 历史 / 近期消息 + 辅助实体关联

宿主提交查询与 filters
  → 语义候选池 → BM25 / entity 加分 → 可选 reranker
  → 返回记忆文本与元数据 → 宿主组织实际模型输入
```

## 默认能力与可选能力

`MemoryConfig` 默认 provider 为 OpenAI LLM、OpenAI embedder 与 Qdrant vector store，并单独配置 SQLite history 路径。默认构造并不代表“完全离线”：模型请求是否外发取决于 provider 配置。也不能仅凭 Qdrant 的 `on_disk=False` 就说记录不持久，local client 的 path 与服务端连接方式需要分别确认。

检索当前具备语义、关键词和实体加分机制，BM25 是否生效还取决于后端、稀疏槽与编码依赖。实体索引采用相同 vector provider 的独立 collection，关联 `linked_memory_ids`，不等于完整知识图谱。当前 Python `MemoryConfig` 与 `main.py` 没有接入旧 graph 配置调用链，不能将仍留在仓库的图模块当作默认运行中的能力。

## 不从一个入口推导所有部署

托管客户端的 add、search 分别访问 `/v3/memories/add/` 与 `/v3/memories/search/`。端点名称能证明客户端调用路径，不能证明托管服务内部使用与 OSS 相同的存储、抽取轮次或恢复机制。

本项目后续比较会固定到这一 Python OSS 基线，记录具体 provider、依赖与配置。生产接入仍需核验身份授权、备份、失败重试、事实变更与中文检索质量。

## 源码定位

- [OSS 装配和常规处理链](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`Memory.__init__`、`_add_to_vector_store`、`AsyncMemory`。
- [默认配置模型](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/base.py)：`MemoryConfig`。
- [托管客户端的端点](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py)：`MemoryClient.add`、`search`。
- [当前抽取提示词](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/prompts.py)：`ADDITIVE_EXTRACTION_PROMPT`。

## 自测

1. `Memory` 和 `MemoryClient` 都有 add 方法，为什么不能断言它们使用同一套内部状态？
2. 当前 ADD-only 抽取与显式 update、delete 能否同时成立？
