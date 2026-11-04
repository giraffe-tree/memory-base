---
id: projects.mem0.updates-forgetting
title: ADD-only 之后怎样更正旧记忆，删除又留下什么？
summary: 自动提取持续新增，显式 update/delete 修改主记录；过期、实体清理和历史保留分别承担不同职责。
project: mem0
minutes: 9
status: source_verified
prerequisites: [projects.mem0.write-path, projects.mem0.storage-index]
sources: [mem0/memory/main.py, mem0/memory/storage.py, mem0/client/main.py, tests/memory/test_main.py]
---

## 结论：自动新增与显式修改并存

在 `ed1f10fc8708` 的 Python OSS 中，默认 `infer=True` 采用 V3 ADD-only 提取：已有记忆作为参考，模型提取新信息，程序为通过去重的文本创建新 ID。它没有沿用旧印象中的“模型先决定对旧 ID 做 ADD、UPDATE、DELETE”自动操作循环。`add` 的部分注释仍有旧措辞，应以实际 `_add_to_vector_store` 为准。

与此同时，`Memory.update`、`delete`、`delete_all` 仍然存在。自动提取策略发生变化，不代表用户失去显式修改能力；也不能从托管服务的时间推理功能，推导开源实现已经自动管理所有事实的新旧关系。

## 一个项目决定变化后发生什么

假设先保存“项目使用 Python”，后来调用 add 输入“项目改用 Rust”。第二次提取会读取同作用域近期消息和相似旧记忆，但持久化阶段仍创建新记录。旧 Python 记录不会仅因为这次新增而被自动物理删除。

最终回答能否正确选择 Rust，需要进一步检查提取结果、检索排序、元数据和宿主提示。若业务明确要替换某条当前状态，可以定位原 `memory_id`，调用 `update(memory_id, text=...)`；若要保留事件历史，则需要由应用约定如何表达“曾经”和“现在”。这两种产品语义不能仅交给 ADD-only 这个名称解释。

## 显式 update 如何传播

`_update_memory` 先读取主向量记录，复制原 payload，合并允许修改的 metadata，重算正文 hash、BM25 用的词形文本和更新时间。创建时间保留；`user_id`、`agent_id`、`run_id`、`actor_id` 等身份字段会被过滤，不能通过 metadata 偷换作用域。

文本更新会生成 embedding，再调用 `vector_store.update`。后端明确返回 false 时视为未找到，不继续记录成功 UPDATE；上游有“更新过程中发生删除”的回归测试。主记录成功后，SQLite 写入旧文本和新文本的 UPDATE 历史。正文确实变化时，再清理旧实体关联并从新正文重建实体关联。

这些步骤跨主向量库、SQLite 和实体 collection 顺序执行，未组成同一事务。若历史写入失败，主记录可能已改变；实体维护失败则被记录并吞下，不阻断主操作。因此更新返回、历史完整和实体一致应分别检查。

## delete 是主记录删除，不是全链路抹除

`_delete_memory` 取得旧 payload 后，先删除主向量记录，再在 SQLite 保存 `DELETE` 事件，包含旧正文、时间和删除标记，最后尝试去除实体记录中的关联 ID。没有其他关联时删除实体，否则更新剩余关联。

实体清理只在本进程的 `_entity_store` 已初始化时执行，扫描还有当前实现的数量边界；内部失败为非致命。因此不能把删除成功解释成所有实体状态已经同步。更不能解释为彻底遗忘：历史中有意保留旧正文，近期消息表也没有在该单条删除路径按事实自动清理。

`delete_all` 必须提供至少一个作用域，按批次重复列举和删除，防止只处理后端默认列表的一页；遇到重复批次会停止。`reset` 则重置更大范围状态，操作语义与按用户删除不同。

## 过期隐藏与托管扩展要分开

OSS 支持 `expiration_date`，日期早于当前 UTC 日期才视为过期。search 与作用域 get_all 默认隐藏过期记录，可用 `show_expired=True` 查看；`get(id)` 没有同样过滤。它是可见性策略，不是后台自动擦除。

托管 `MemoryClient.delete(delete_linked=True)` 会把联动删除参数发给平台，注释描述清理被替代记录链。但本仓库只能核验请求构造，不能证明服务端具体执行与完成时机，也不能将该参数直接套用到 OSS 的 `Memory.delete`。

## 源码定位

- [V3 新增、显式更新、删除与过期判断](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`_add_to_vector_store`、`_update_memory`、`_delete_memory`、`_payload_is_expired`。
- [历史与近期消息持久化](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)：`SQLiteManager`。
- [托管删除参数](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py)：`MemoryClient.delete`。
- [身份字段保护及更新删除竞争测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/memory/test_main.py)。

本页核验代码与测试定义，未运行真实后端的删除传播和历史恢复实验。

## 自测

1. 自动提取只 ADD，与显式 update/delete 可用，为什么没有矛盾？
2. 删除后主搜索没有命中，为什么仍不能宣布旧内容已经完全擦除？
