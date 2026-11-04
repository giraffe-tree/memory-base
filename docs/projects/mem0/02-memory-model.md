---
id: projects.mem0.memory-model
title: 一条 Mem0 记忆的正文、来源和作用域放在哪里？
summary: 追踪 vector payload、SQLite 历史与十条近期消息，以及实体到记忆的辅助关联。
project: mem0
minutes: 10
status: source_verified
prerequisites: [projects.mem0.overview]
sources:
  - mem0/configs/base.py
  - mem0/memory/main.py
  - mem0/memory/storage.py
  - mem0/configs/prompts.py
  - tests/memory/test_session_scope.py
---

## 结论：当前正文在存储记录里

Python OSS Mem0 的记忆主体是 vector store 中一条带文本 payload 的记录，不以可读 Markdown 文件为内容主线。SQLite 另外保存变更历史及本作用域近期消息；实体 collection 保存词项与记忆 ID 的关联。这三层承担不同职责，不能把 history.db 直接当成完整会话归档。

本页于 2026-11-04 静态核验 `ed1f10fc87080f0b67f99be370817504888462ab`，未执行真实写入。以下字段和行为以 Python OSS 普通抽取路径为准。

## 先跟踪一句项目决定

用户说“alpha 项目暂时使用 Python”，宿主以 `user_id=u1`、`run_id=alpha` 提交。抽取生成的自包含事实会获得新 UUID，正文写入 payload 的 `data`，还附 `hash`、`text_lemmatized`、创建更新时间和 scope。返回接口把 `data` 转为 `memory`，将部分常用字段提升到顶层，其余作为 metadata。

| 数据 | 主要内容 | 可以回答的问题 |
| --- | --- | --- |
| 主记忆记录 | UUID、data、embedding、scope、时间和自定义 metadata | 当前按 ID 保存了什么可检索文本？ |
| SQLite history | memory ID、旧值、新值、事件和时间 | 该记录经历过什么显式变更？ |
| SQLite messages | scope、role、content、name、保存时间 | 本 scope 最近提交过哪些消息？ |
| 辅助实体记录 | 实体文本、类型、linked_memory_ids、scope | 哪些记忆与这个词项有关，可参与检索加分？ |

## scope 不等于用户认证

`_build_filters_and_metadata` 要求至少提供 `user_id`、`agent_id`、`run_id` 之一，允许多个同时存在。ID 会校验并裁剪空白；写入参数决定 scope，metadata 中伪装成身份的字段会被忽略并告警。这避免 freeform metadata 偷偷把记录放进另一身份范围。

组合 scope 还被 `_build_session_scope` 转成稳定字符串，用于 SQLite 近期消息。它对百分号、等号和连接符做转义，避免不同 ID 组合碰撞。scope 是应用提交的查询边界；仅能证明代码按给定身份筛选，不能证明调用者有权使用该身份。

`add` 通过顶层参数接受这些 ID；当前 `search`、`get_all` 要求放在 `filters` 中，并拒绝顶层同名参数。配置和调用代码应按本版本签名编写，不能照搬旧示例。

## 十条消息不是长期来源账本

`SQLiteManager.save_messages` 为输入生成消息 UUID 和当前保存时间，并在同一 SQLite 事务内只保留每 scope 最新十条。`get_last_messages` 取最近记录后按时间正序交给抽取提示。

这是一段用于消歧的近期上下文，不是无限增长的原始 transcript，也不保存每条输入的外部来源 ID 与真实发生时间。重试提交相同消息不会因为消息 ID 自动去重；写入超过十条后旧行会被删除。若产品需要审计、逐句回溯或重放，应由宿主保留自己的来源档案。

主记录 `created_at` 默认是落盘准备时的 UTC 时间，显式 `timestamp` 参数在 OSS add 被拒绝。`expiration_date` 可作为到期日期参与搜索可见性，但不是事实有效时间线。创建时间、对话发生时间与事实生效时间不能互相替代。

## 提示词字段不等于落盘字段

ADDITIVE 提示词要求新事实关联已有记忆 ID；生成器还提供 summary、recently extracted、observation date 等槽位。但当前调用只传部分参数，不能把模板支持的所有输入都写成这条路径已经拥有的状态。

例如普通抽取循环实际写入正文、hash、时间、scope，以及存在时的 `attributed_to`；没有把模型输出的 `linked_memory_ids` 直接写入主记录。后续实体 linking 生成的同名字段位于实体 collection，是“实体关联哪些记忆”，不能混成“事实之间已经建立可查询的演化关系”。

## 更正历史如何保留

若后来决定改用 Rust，ADD-only 路径可产生第二条记忆，旧 Python 记录不会仅因新事实到来就自动覆盖。history 为每条记录记录新增，显式 update 才产生该 ID 的修改历史。准确回答“当前选择”仍需时间和语境表达、明确更新策略或宿主判断，不能只按 UUID 新旧推断。

## 源码定位

- [返回模型和配置](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/base.py)：`MemoryItem`、`MemoryConfig`。
- [scope 与 payload 生成](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`_build_filters_and_metadata`、`_build_session_scope`、`_add_to_vector_store`。
- [消息裁剪与历史](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)：`save_messages`、`get_last_messages`、`batch_add_history`。
- [组合 scope 测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/memory/test_session_scope.py)。

## 自测

1. 为什么 SQLite 中存在 messages 表，仍不能证明保存了可完整重放的原始会话？
2. 提示词输出的事实链接，与实体索引的 linked_memory_ids，分别在哪一层得到实际保证？
