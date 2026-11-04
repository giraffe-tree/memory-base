---
id: comparisons.architecture-map
title: ReMe 与 Mem0：相同的记忆目标，不同的状态骨架
summary: 用十个统一切面对照文件工作区与向量 payload，先确定研究表面与状态归属，再讨论采用条件。
project: comparison
projects:
- reme
- mem0
minutes: 10
status: source_verified
prerequisites:
- projects.reme.overview
- projects.mem0.overview
sources:
- project: reme
  path: reme/application.py
- project: reme
  path: reme/config/default.yaml
- project: reme
  path: reme/components/file_store/local_file_store.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/memory/storage.py
- project: mem0
  path: mem0/configs/base.py
- project: mem0
  path: README.md
- project: mem0
  path: server/main.py
- project: mem0
  path: server/auth.py
---

## 结论与比较基线

ReMe 的主线围绕用户可读工作区文件展开：来源经历、daily、digest 与派生索引分别承担职责。当前 Mem0 Python OSS 主线围绕向量 store 中的事实 payload 展开：自动提取追加新记忆，SQLite 保留变更历史和最近消息，实体 collection 辅助关联与检索。它们都需要宿主把保存和使用接入实际任务。

本页对照 ReMe `d323356e6f11` 与 Mem0 `ed1f10fc8708`，均核验于2026-11-04。比较以源码为依据，不是同环境性能实验，也不把 Mem0 托管服务的数字归入 OSS。

## 十个切面放到同一张图上

| 切面 | ReMe 当前基线 | Mem0 当前 Python OSS 基线 |
| --- | --- | --- |
| 系统边界 | Application 装配组件和 Jobs，提供进程内、HTTP、MCP入口 | Memory／AsyncMemory 编排模型和store；HostedClient是另一服务的客户端 |
| 记忆模型 | 来源 session、daily、digest、FileNode与chunk分层 | UUID记忆项，文本／hash／时间／scope保存在payload；另有历史和消息缓存 |
| 自动写入 | Agent通过文件工具创建／更新daily，也可以跳过 | infer=True 单次 ADD-only 提取，再嵌入、去重和插入 |
| 事实载体 | 工作区正文文件；分块、图和索引可派生 | 主向量记录及payload；SQLite并不保存可重放全量来源 |
| 检索 | 默认BM25；可配向量，两路都有结果时做RRF | 语义候选池，再结合可用BM25与实体信号归一加分 |
| 更新遗忘 | daily更新与Dream整合；来源删除不保证事实级撤销 | 自动add不覆盖旧项；显式update/delete操作指定ID并记history |
| 运行一致性 | 请求、应用、文件、索引与Dream水位分层 | 主store、SQLite与实体collection分步写入，没有统一事务 |
| 接入隔离 | 文件范围与Job暴露边界不等于用户认证 | scope过滤不等于身份授权；REST鉴权和按ID归属检查也须分开 |
| 评测观察 | 分开观察文件、索引、结果供给和回答 | 分开观察提取项、候选与分数、history、供给和回答 |
| 成本采用 | 整理Agent、Dream、索引与最终模型输入分别计费 | 提取、查询和事实embedding、实体/NLP、存储与最终输入分别计成本 |

表中的机制不等于默认环境全部启用；例如 ReMe 默认未连接 embedding store，Mem0 关键词检索取决于后端实现，实体抽取也有依赖与降级。

## 用同一个故事追踪状态

周一决定暂用 Python，周二决定改用 Rust。ReMe 可以先保留来源，再更新 daily，之后 Dream 整合长期知识；各层不保证同一时刻完成。Mem0 可以追加两条带语境事实，也可以由宿主定位旧ID后显式更新。后者没有自动获得“当前事实覆盖旧事实”的统一语义。

真正要验收的共同输出是：当前状态指向 Rust、过去试用 Python 的经历可以解释、作用域不串项目、来源和失败状态可追踪。不能仅对比记忆条数，更不能一边读文件一边只看最终回答就宣称效果相同。

## 文件、实体与图不要混为一谈

ReMe 的文件图关联文档和链接，Mem0 当前 entity store 则保存实体向量及 linked_memory_ids。仓库里有 graphs 目录或历史介绍，不能代替当前 MemoryConfig 与主链路实际接入的证据。这里没有把实体collection称为关系知识图谱，也没有把正文可编辑直接等同于恢复保证。

Mem0 SQLite最近消息上限为每scope十条。本轮已通过局部存储实验观察容量、scope分离和重开后保留；这仍不是向量store的恢复实验。ReMe的来源记录则还要考虑消息清洗与ID合并，不能简单叫作输入的无损副本。

## 怎样据此考虑采用

下面是基于实现的工程推断：若希望人工直接检查、修改知识并从正文重建索引，ReMe 的文件组织更贴近这个流程；仍需管理监听时延、Dream窗口与副作用恢复。若应用围绕结构化事实API、user／agent／run过滤及可替换向量后端构建，Mem0 的接口组织更直接；仍需补齐完整来源、当前状态策略、按ID授权和多store一致性。

采用决定还需要在实际语言、模型、数据规模与恢复要求下验证。两边本轮没有同环境端到端质量或延迟测量，因此这里不给总分或胜负。

## 继续比较

接着读 [写入与重试](write-path.md)、[事实更新与遗忘](fact-updates.md)、[候选与上下文供给](retrieval-context.md)。它们使用相同故事展开，结论分别回到两个固定版本。


## 源码定位

- [reme · reme/application.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)
- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [reme · reme/components/file_store/local_file_store.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)
- [mem0 · mem0/configs/base.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/base.py)
- [mem0 · README.md](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/README.md)

- [mem0 · server/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/main.py)

- [mem0 · server/auth.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/auth.py)

## 自测

1. 同一句“项目现在用Rust”，两边分别保存在哪里，哪些状态是派生的？
2. 为什么两个项目都出现“图”和“历史”，仍不能直接认为数据模型相同？
