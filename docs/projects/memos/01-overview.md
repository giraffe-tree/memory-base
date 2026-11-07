---
id: projects.memos.overview
title: MemOS 的 MOS、MemCube 与多种记忆分别管什么？
summary: MemCube组合可选记忆后端，MOS负责用户、容器、搜索与调度；当前LoRA模块是占位实现，不能由工厂注册推断参数记忆已可用。
project: memos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/memos/mem_os/core.py
  - src/memos/mem_os/main.py
  - src/memos/mem_cube/general.py
  - src/memos/memories/factory.py
  - src/memos/memories/activation/kv.py
  - src/memos/memories/parametric/lora.py
---

## 系统边界与版本

本次固定 `MemTensor/MemOS` 的 `d326a6419467c2205041b58533b0ebfdf4f38173`，2026-11-07 静态核验。主线是 Python SDK 的 MOS/MOSCore、GeneralMemCube 与 tree_text，必要时对比 general_text；不把 SDK、API 服务、云平台和论文实验当作同一条已验收路径。本轮未安装依赖、启动图数据库或运行模型。

MemOS 的组合单位是 MemCube，而不是一张统一的 memory 表。GeneralMemCube 根据配置构造 text_mem、act_mem、para_mem、pref_mem，标记 uninitialized 的分支保留为空。MOSCore 管理这些 Cube、用户访问关系、会话记录、MemReader、聊天模型和可选 scheduler。因此“多种记忆”首先是对象接口与运行编排的组合，具体持久化与检索仍由每个后端承担。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_cube/general.py#L21-L48) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L38-L79)

## 用一次项目纠正解释责任归属

用户向 MOS.add 提交“Phoenix 原先用 Python，现在决定用 Rust”。MOS 先确定用户可访问的 Cube，再按文本后端选择处理方式；tree_text 会交给 MemReader 提取，之后写给 TreeTextMemory；非 tree 后端的 messages 分支则直接把每条 content 包成 TextualMemoryItem。可见“调用 add 就一定有模型提炼与冲突解决”并不成立，行为受后端与模式共同决定。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L684-L799)

读取时 MOS.search 遍历选中的 Cube，分别调用 text_mem 和 pref_mem 搜索；MOS.chat 则进一步把召回文本组装为 system prompt，并交给 chat_llm 生成回答。选择 search 接口的宿主，仍需自己决定如何注入上下文；选择 chat 接口则接受框架的提示构造和会话管理。这是库函数之间的进程内调用；API 与 MCP 是另外的入口适配，不是每次后端访问都要经过的协议。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L546-L682) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L251-L337)

## 三种表示不等于三种都完整可用

MemoryFactory 确实注册 naive/general/tree/preference 等文本后端，也注册 kv_cache、vllm_kv_cache 与 lora。KVCacheMemory 的 extract 调用所选 LLM 的 build_kv_cache，存储 KVCacheItem，并提供缓存合并读取；这要求模型适配器和本地推理条件支持，不能把普通远程聊天 API 的 prompt cache 误称为同一种能力。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/factory.py#L19-L42) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/activation/kv.py#L15-L81)

尤其需要纠正的是 LoRA：此 commit 的模块头部明确标注 placeholder，load 没有实际加载逻辑，dump 写入 `Placeholder`。所以“架构有参数记忆接口”有源码支持，“已实现可用 LoRA 记忆训练、检索和注入”没有。本研究不会拿工厂映射表替代实现核验。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/parametric/lora.py#L1-L41)

## MemCube 可移植性与实际边界

Cube 提供 load/dump，先校验或导出配置 schema，再逐类型调用后端的 load/dump。它有利于把配置与特定类型内容一起搬迁，但导出是顺序调用，不是跨图数据库、向量库、KV 缓存和模型参数的单一原子快照。不同后端的文件形态、数据库依赖和可恢复程度仍需逐个验证；有 dump 方法不保证任意配置都能无损迁移。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_cube/general.py#L50-L130)

MOS 还可以启用 CoT 增强聊天路径；未启用时直接走 MOSCore.chat。因此源码中出现更复杂的推理与分解能力，不意味着默认的每一次搜索都调用这些流程。成本与效果比较必须记录 enable_cot、scheduler、text backend、同步模式及外部检索开关。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/main.py#L108-L130)

## 采用判断与验收范围

如果目标是把不同用户、不同知识容器、偏好和可选模型缓存放在统一 Python 编排入口中，MemOS 提供了较完整的组件组合。若只要简单 add/search，这些后端、调度和可选依赖可能增加部署负担。真正的差异来自 tree_text 的图组织、来源与版本信息，以及运行中调度；它们应通过自己的持续任务而不是模块数量来判断价值。

静态阅读还发现高层接口与后端之间有需要单独验证的适配边界，详见检索生命周期页：显式 Cube 选择时的访问过滤、tree_text 的更新限制和删除参数类型。它们不代表已经复现的线上缺陷，也不能由整体平台设计推断已经自动解决。

## 与通用记忆服务比较时应固定什么

比较之前应先列出实际启用的 Cube 类型：例如只开 tree_text、不启用激活记忆、偏好和 CoT，才能把后端的结果与其他文本记忆服务对照。如果另一组打开了 fine 搜索、图整理或额外查询分解，准确性和成本差异应归因到这些具体步骤，而不是归因于 MemOS 这一总名称。

同理，应用拥有多个用户时应说明一个进程是否加载全部 Cube，以及用户身份由可信服务注入还是来自请求参数。Cube 共享是显式业务能力，用户与 Cube 映射是访问机制；两者与记忆 metadata 中的 user_id 并不天然等价。必须沿实际入口验证访问关系如何作用到检索，不能只检查数据库里存在用户字段。该采用建议与后续静态适配风险相互补充，仍需要真实隔离样本来确认。

## 自测

1. MemCube 接口存在 act_mem 和 para_mem，为什么不能断言当前配置两者都可用？
2. 调用 MOS.search 与 MOS.chat 时，谁负责把记忆放进最终模型输入？
