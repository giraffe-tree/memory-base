---
id: foundations.start.files
title: 为什么把记忆保存成可以打开的文件？
summary: 文件持有知识正文，索引和处理目录服务于查找与维护；恢复时要先区分状态职责。
project: reme
minutes: 5
status: source_verified
prerequisites:
- foundations.start.reme
sources:
- reme/components/file_store/local_file_store.py
- reme/schema/application_config.py
- reme/steps/file_io/_path.py
---

## 一份内容，多种辅助状态

把记忆文件想成书页，把搜索索引想成书后的查找表。索引能告诉你去哪里找，但不应该成为唯一还能恢复知识的地方。ReMe 的设计把用户工作区文件作为持久内容，索引、catalog、图和缓存作为派生或辅助状态。

“可重建”是架构目标，重建过程是否完整、在哪些后端适用，仍要看对应实现与实际检查，不能仅凭文件化设计就视作恢复保证。

## 工作区里有什么

`ApplicationConfig` 定义 `session`、`daily`、`digest`、`resource`、`mem_session` 与 `metadata` 等目录。原始来源对话位于 `session/dialog`；daily 记录经历；digest 保存整理结果；metadata 保存索引、回执及处理状态等辅助数据。

`mem_session` 是记忆 Agent 自己的会话状态，不能拿它替代用户来源会话。两者都可能是 JSONL，但内容归属不同。

## 文件操作也有约束

`resolve_path` 将相对路径解析到工作区，检查解析后的目标仍在其中；`_check_path_permission` 再处理可选的允许路径。路径锁、mtime 检查和原子替换负责的是更具体的写入边界，不会仅因为使用 Markdown 就自动成立。

例如用户手动更正一条笔记之后，索引需要跟随更新。文件已更改、索引已更新、一次查询已看到新值，是三个需要分别观察的时刻。

## 边界

文件工作区并不自动构成多租户权限系统；索引可派生也不意味着任意 metadata 都能随时清空。删除成功回执可能影响重试行为，删除处理水位可能引发重新整理。恢复时要先问清这个状态参与了什么协议。


## 源码定位

- [reme/components/file_store/local_file_store.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/file_store/local_file_store.py)
- [reme/schema/application_config.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/application_config.py)
- [reme/steps/file_io/_path.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/_path.py)

## 自测

1. 为什么修复索引不应该先删除 daily？
2. 索引、成功回执和 Dream 水位都在 metadata，它们能否被同样处理？
