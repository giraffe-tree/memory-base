---
id: projects.reme.memory-model
title: 一条记忆为什么会同时出现在四层数据里？
summary: 区分来源会话、daily、digest 与派生索引，理解身份、时间和来源如何传递。
project: reme
minutes: 9
status: source_verified
prerequisites: [projects.reme.overview]
sources:
  - reme/schema/application_config.py
  - reme/schema/file_front_matter.py
  - reme/schema/file_node.py
  - reme/schema/file_chunk.py
  - reme/schema/emb_node.py
  - reme/steps/evolve/auto_memory.py
  - reme/steps/evolve/dream/integrate.yaml
  - reme/components/file_chunker/markdown_file_chunker.py
---

## 一句话结论

ReMe 没有把所有记忆压进同一种数据库记录：来源会话保存消息，daily 保存一次经历的整理结果，digest 保存可复用知识，文件节点与分块支持查找。这些层有不同身份与更新路径，不能视为自动同步的四份副本。

本篇在 2026-11-04 静态核验固定 commit `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9`；示例文件用于解释模型，不代表本次实际生成的记忆。

## 沿一句决定走过四层

假设 11 月 4 日的一次会话决定“先使用 Python”，11 月 6 日因性能要求改为 Rust。来源消息保留讨论过程；两天的 daily 可以分别记下当时的决定与原因；digest 可以维护项目的当前约束并关联来源；检索分块则是从这些笔记生成的文本片段。

| 层 | 默认位置或结构 | 身份与用途 |
| --- | --- | --- |
| 来源会话 | `session/dialog/<session_id>.jsonl` | 消息有自己的 ID 和时间，用来回看提交过的材料 |
| 当日笔记 | `daily/<日期>/<name>.md` | 以路径定位，frontmatter 可关联 session 与来源会话 |
| 长期知识 | `digest/personal`、`procedure`、`wiki` | 提示词按个人相关信息、方法与通用知识组织 |
| 查找状态 | `FileNode`、`FileChunk`、索引 | 根据文件构造，用于路径、链接、文本与分数检索 |

注意 digest 的分类和语义合并策略来自整理流程及提示词；它们不是不可违反的数据库约束。模型是否准确保留“先试用”和“正式迁移”的区别，需要实验检查。

## 来源与时间不是同一个字段

`AutoMemoryStep._session_source_path` 根据配置的 `session_dir` 构造来源路径；`_session_link` 把它转为 wikilink。查找 daily 时先比较 frontmatter 的 `session_id`，再兼容比较 `source_conversation`。同一个 session 在不同日期可以对应不同日记，不能把 session ID 当作全工作区唯一笔记 ID。

笔记日期优先使用显式 `date`，否则从消息时间推导，再退回当前日期。带时区的时间戳会转换到应用时区，默认 `Asia/Shanghai`。这表示一条发生在 UTC 深夜的消息，可能落入本地的次日目录。目录日期承载的是整理所用日期，不是事实永远有效的证明。

`FileNode.st_mtime` 则是文件系统修改时间，用于变化检测。它与消息发生时间、事实生效时间不同。判断“这是不是当前决定”需要阅读内容与来源，不能只取 mtime 最大的片段。

## 文件节点与分块各保存什么

`FileNode` 包含工作区相对 `path`、`st_mtime`、出链、`chunk_ids` 和解析后的 frontmatter。图中的节点首先是一份文件；当前结构并不是天然的“每个人、每个项目、每项事实一张实体表”。

`FileChunk` 继承文本、可选 embedding 和任意 metadata，增加路径、起止行与检索阶段分数。`set_hash_id()` 对路径、行范围和文本组合做确定性哈希。内容或位置变化会改变分块身份，这既帮助版本替换，也影响搜索的已返回结果去重。

`FileFrontMatter` 只直接声明 `name`、`description`，同时允许额外字段。`session_id`、来源链接或标签可以被保留下来，但“出现在文件 frontmatter”不自动等于“出现在每个 chunk 的 metadata”。默认 Markdown chunker 的 `include_frontmatter_in_metadata` 为 false；若要按自定义 metadata 搜索，应先确认分块配置如何投影这些字段。标签索引读取文件节点 frontmatter，是另一条路径。

## 这套模型带来的取舍

透明文件方便人工查看、更正和备份；派生索引可以从文件重建。代价是语义状态与索引状态之间有处理过程。修改来源会话不会自动令已有 daily 重跑提取，改 daily 也不会保证旧 digest 立即撤回。

来源链接说明“从哪里来”，尚不足以证明“这条结论确实由该来源支持”。保留历史与维护当前状态，需要整理提示词、文件操作和宿主使用策略共同配合。研究时应分别验证引用准确性、时间语义和变化传播。

## 源码定位

- [目录和时区默认值](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/application_config.py)：`ApplicationConfig`。
- [来源绑定与日期推导](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.py)：`_session_link`、`_find_session_note`、`_message_day`。
- [节点](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/file_node.py)、[分块](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/file_chunk.py)与[Markdown 元数据投影](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_chunker/markdown_file_chunker.py)。

## 自测

如果日记中有 `project: alpha`，为什么查询这个 metadata 字段仍可能没有命中？同一句决定在 session、daily、digest 与 chunk 中分别承担什么职责？
