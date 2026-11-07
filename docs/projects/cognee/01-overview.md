---
id: projects.cognee.overview
title: Cognee：从知识管线到记忆 API，当前分了哪几层？
summary: 区分 remember/recall/improve、原始资料与派生图，以及本地、远程和 session 路径的状态归属。
project: cognee
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - cognee/api/v1/remember/remember.py
  - cognee/api/v1/cognify/cognify.py
  - cognee/api/v1/recall/recall.py
  - cognee/modules/cognify/config.py
  - cognee/context_global_variables.py
  - cognee/modules/search/methods/search.py
---

## 结论与研究版本

当前 Cognee 已不只是 `add→cognify→search` 的知识图管线：上层提供 `remember/recall/improve/forget`，同时保留低层阶段与多种专用检索器。一次 remember 可进入 session 缓存，也可持久化资料并构图；一次 recall 可返回检索上下文，也可在库内生成答案。因此要先选定操作路径，再比较“写入成功”或“召回延迟”。本页固定 2026-11-07 获取的源码，不复述旧版所有默认行为，也没有安装或运行上游。

## 一条经历有哪些落点

假设输入“alpha 项目切换 Rust，发布时要保留调试符号”。没有 session_id 的永久记忆路径在 `_remember_inner` 中顺序执行 add、cognify，再按配置 improve。add 管资料与 dataset，cognify 将资料切块并生成知识表示。带 session_id 时先写 session cache，返回 `session_stored`，可在后台把会话桥接到长期图；桥接失败记录 improve_error，不把已成功的 session 写入改成失败。[remember 两条主路](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/remember/remember.py#L2153)

这给产品带来实质区别：用户看到“已记住”，可能代表会话缓存已保存，也可能代表永久图已构建。后台模式还会先返回 running 的结果对象，由任务继续填充状态。调用方必须显示与其产品承诺一致的完成阶段，不能把启动成功当成全部资料已经可检索。

## 五层职责与执行位置

| 层 | 程序中的职责 | 持有的状态 |
| --- | --- | --- |
| 记忆 API | 选择永久／session、路由、串联阶段 | 操作记录与结果对象 |
| ingestion | 解析输入并创建资料记录 | 原始文件、Data、Dataset |
| cognify | 分块、提取、摘要、落图与索引 | chunk、实体关系、向量、来源归属 |
| recall／retriever | 权限范围、查询类型、候选与上下文 | 搜索历史，可选会话交互 |
| improve | 会话沉淀、反馈、偏好与冲突等阶段 | 长期派生状态和维护结果 |

这些 Python API 可在宿主进程内执行；设置 remote client 后存在转发至 HTTP 服务的路径。MCP 又是在工具协议上包装能力，不是 Python 内部函数的别称。远程参数并非都能无损序列化，代码对不能转发的参数有显式拒绝，研究本地行为不能顺带宣布云端实现一致。[remember 本地与远程入口](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/api/v1/remember/remember.py#L1510)

## 当前默认值改变了成本解释

`CognifyConfig` 当前默认 `early_chunk_indexing=True`，先把 chunk 与向量写入，使资料在实体提取完成前已有部分可用搜索能力。默认摘要方式是 `from_extraction`，由抽取结果生成摘要，避免再为每块独立调用摘要 LLM；设成 llm 时才走独立摘要生成。[配置来源](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/cognify/config.py#L15)

提取器默认 auto：有可用 LLM 配置时走模型抽取，无可用密钥时选择本地 GLiNER demo。该 demo 不应等同企业版提取质量，而且可能在首次运行安装运行时；本次没有触发任何安装。文档中旧的“cognify 一定要求 LLM key”和“每个 chunk 必有两次 LLM”都不应直接用于当前版本。无 LLM 时可返回检索上下文，也不等于能生成与完整模型相同的答案。

## 用户、dataset 与 backend 的边界

Data、用户、ACL 与运行记录在关系层；图与向量按 dataset handler 建立上下文。`authorized_search` 先取得可读 dataset，再在其上下文运行检索；数据库配置借助 ContextVar 在任务间传递。它把调用方身份、权限判断、数据库位置分开：选择数据所在 owner 并不自动等于授权。[授权搜索](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/modules/search/methods/search.py#L220)

默认访问控制路径要求图、向量都存在匹配 handler；不支持时会报错，而不是悄悄退化成共享库。显式关闭访问控制是另一种部署模式，不能仍按默认多用户能力宣传。宿主还必须把实际认证用户传给 SDK；使用默认用户的本地脚本不能证明外部用户隔离已完成。[backend 检查](https://github.com/topoteretes/cognee/blob/8853378eae5366addb064e758e560a456146ae1a/cognee/context_global_variables.py#L48)

## 采用条件与验证问题

Cognee 的长处是把文档、图知识、会话、反馈与代码等能力组织成可组合任务；适合资料类型较多、需要逐阶段观察处理状态的应用。相应代价是状态分散、检索策略众多，以及 pipeline、session、improve 的不同完成条件。采用前应固定一种真实业务路径，测早期 chunk 可用、构图完成与 improve 完成三个时点，避免只对全功能默认演示作判断。

本轮仅阅读源码。尚未验证不同 backend 的并发锁、关闭 caching 的行为、后台进程终止后的恢复、真实抽取与答题效果，也没有同环境排名。

另一个接入取舍是把框架的自动化保持可观察：若只给产品暴露 remember 与 recall 两个词，用户难以区分资料已保存、图待构建、维护失败及回答取自缓存。应用可以沿已有结果与阶段状态呈现具体完成点，让后台处理持续推进，而不是把所有状态压成一个布尔值。这是基于实现边界的产品建议，尚未作为本轮交互验收结果。

## 口述自测

1. 返回 session_stored 后，能承诺该经历已经成为永久图事实吗？
2. 提取器 auto 与摘要 from_extraction，分别改变哪部分模型成本？
