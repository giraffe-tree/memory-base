---
id: projects.mem0.evaluation-observability
title: 检索解释、历史与官方成绩分别能证明什么？
summary: OSS 提供局部解释与历史，自托管服务记录请求，README 成绩属于托管平台，不能作为本地复现结果。
project: mem0
minutes: 8
status: source_verified
prerequisites: [projects.mem0.retrieval-context, projects.mem0.runtime-consistency]
sources: [mem0/memory/main.py, mem0/memory/storage.py, mem0/memory/telemetry.py, server/main.py, server/errors.py, server/routers/requests.py, server/telemetry.py, tests/memory/test_main.py, README.md, .gitmodules]
---

## 结论：解释结果与效果评测分开

搜索返回高分、history 出现 ADD、HTTP 请求成功，都不能单独证明“下一次协作使用了正确的记忆”。要沿提取、落库、检索、上下文和回答逐段观察。当前基线 `ed1f10fc8708` 提供这些局部观察点，但本研究尚未运行托管平台评测，也没有本地准确率与延迟数据。

README 的成绩明确属于托管平台，包含开源 SDK 之外的优化。研究时应把它归为官方报告，保留原始条件，不能把数字复制到 Python OSS 的“实测结果”栏。

## 一条错误回答怎样倒查

假设模型还建议使用 Python。先查看 add 返回了哪些 ID，再用 get 读取正文和时间、检查新的 Rust 决定有没有被提取；接着检查 search 的 filters、候选、过期过滤和 explain 信息。若新旧记录都存在，还要判断实际任务是否需要“当前状态”而非历史事件。

最后检查宿主送给回答模型的实际上下文。若检索已返回 Rust 而宿主没有注入，继续调整记忆提取没有解决根因；若正文错误，扩大召回也可能只会放大错误。为每个合成样本保存输入、正文快照、查询结果、实际上下文与最终回答，比只记一个总分更容易定位问题。

## 源码现有观察点

`search(explain=True)` 可在每条结果中加入 `score_details`，帮助理解语义、BM25 和实体信号怎样参与排序。它解释的是算法算分，既不是概率校准的事实正确率，也不保证内容仍适用于当前任务。实体信号缺失、关键词后端不支持等降级，应与完整配置分别比较。

SQLite history 保存单条记忆的 ADD、UPDATE、DELETE 及旧新正文。它适合查看显式变更，但不自动等同于完整来源谱系：近期消息只有十条窗口，主记录、历史和实体没有统一事务；部分 history 写入失败还可能只留下日志。

自托管服务为请求分配 request ID，响应写入 `X-Request-ID`，上游错误分类成 provider 认证、限流、超时或数据服务失败等 code。请求中间件异步保存方法、路径、HTTP 状态、耗时和认证类型到 PostgreSQL。日志写入失败会回滚并记录异常，不让这项观察能力成为业务提交的一部分。

`/requests` 是管理员查看入口，当前查询只展示 API-key 类型的记录。它不是所有 JWT 请求的完整视图；也没有保存每次提取后的事实快照和模型 token 账单。排查时要明确你正在看的是哪一层日志。

## 遥测不是本地审计

OSS 库默认开启 PostHog 遥测，可在进程启动前设置 `MEM0_TELEMETRY=false` 禁用。代码收集 SDK、系统、provider 和事件信息，部分调用附加过滤键或编码 ID；高频 OSS 事件默认采样，生命周期事件例外。托管客户端另走客户端遥测；REST 安装流程还有管理员注册和 onboarding 事件，后者可包含操作者填入的 use-case 文本。

因此不能把“匿名遥测”解释为从不离机，也不能把采样事件当成完整业务计数。本轮只阅读源码，没有导入 SDK 触发遥测或上传研究材料。

## 评测入口目前核验到哪里

`evaluation/` 在这个仓库是子模块，固定指向 memory-benchmarks 的 `4b61c5d31b9c668a12b4f5e78064248a02c82d2b`；当前工作副本未初始化其内容。能确认仓库声明了独立评测框架，不能声称已经检查或跑通其中每条流程。

后续复现至少同时固定 SDK 与评测提交、数据版本、模型、抽取 prompt、检索预算、provider、NLP 模型和 judge。对比 ReMe 时还要对齐 Agent 多轮查找与单次检索的预算，以及预处理和维护开销。相同题库不同执行方式，数字也不能直接解释为记忆架构优劣。

## 源码定位

- [检索 explain 与历史入口](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)。
- [请求 ID 与错误分类](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/errors.py) · [请求中间件](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/main.py)。
- [OSS/客户端遥测](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/telemetry.py) · [REST 安装遥测](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/telemetry.py)。
- [官方报告的适用范围](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/README.md) · [评测子模块声明](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/.gitmodules)。

## 自测

1. explain 分数很高但回答错误，应该怎样区分正文、检索与供给问题？
2. 为什么 README 托管成绩、采样遥测和本地可复现实验必须分别记录？
