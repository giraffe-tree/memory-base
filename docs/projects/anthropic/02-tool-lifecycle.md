---
id: projects.anthropic.tool-lifecycle
title: 文件记忆修改与托管副本同步怎样处理冲突、失败和删除？
summary: 从精确文本编辑、单文件替换，到 hash 基线、远端冲突优先和删除确认窗口，分别核验两条记忆维护链路。
project: anthropic
minutes: 16
status: source_verified
prerequisites: [projects.anthropic.overview]
sources:
  - src/anthropic/lib/tools/_beta_builtin_memory_tool.py
  - src/anthropic/lib/tools/_memories.py
  - src/anthropic/resources/beta/memory_stores/memories.py
  - src/anthropic/resources/beta/memory_stores/memory_versions.py
  - tests/lib/tools/memory_tools/test_filesystem.py
  - tests/lib/tools/memory_sync/test_memory_sync.py
  - tests/lib/tools/memory_sync/test_lost_response.py
  - tests/lib/tools/memory_sync/test_keep_only_copy.py
---

## 先区分文件成功与同步成功

本页沿固定 SDK `4c7b598466b88559583f98216139be8e9b34c1fc` 讨论两种维护。第一种是应用内 `BetaLocalFilesystemMemoryTool` 修改自己的文件；第二种是 `SessionMemoryStores` 把会话本地副本与托管 store 对齐。以下是源码核验，没有启动同步 worker，也没有执行上游测试或真实 API。

两条路径不能套用同一个“事务”说法：本地工具包含单文件替换，托管副本包含跨 HTTP 的条件写入和后续对账；都不构成多文件、多来源、多个 Agent 的全局语义事务。

## 本地写入：内容是模型选的，执行是普通文件操作

[`create`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L483-L499) 使用排他创建打开文件，写 UTF-8 并 `fsync`，目标已存在时明确报错。因而它不是按内容自动去重的 upsert；重复请求同一个路径会得到文件已存在，换路径则仍可能保存语义重复内容。

[`str_replace`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L501-L547) 要求旧文本精确出现一次。零次或多次都返回工具错误，避免模型含糊地改错位置。成功后给出修改位置附近的片段，方便模型确认。它不理解“暂用”“以后”“仅本次”的语义，正确选择替换范围仍是 Agent 的责任。

`str_replace` 与 `insert` 通过 [`_atomic_write_file`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L282-L304) 在同目录创建临时文件、循环写入、同步文件，再 `os.replace`。这可避免读者看到半个替换结果，但读取旧文件和写入新文件之间未见版本比较或互斥锁：两个编辑者仍可能分别基于旧内容计算新版本，后写覆盖前写。这是静态控制流支持的并发边界，不是本轮已复现的数据丢失。

## 路径隔离与权限保护的责任范围

[`_validate_path`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L396-L411) 将模型路径映射并解析到实际 root 内，拒绝解析结果越界，并返回解析后的路径。创建父目录的 `_secure_mkdir` 对新建各层目录施加受限权限。异步实现也返回解析后的路径，不能把历史版本的行为直接当成当前实现。

这证明默认 handler 有路径保护，不证明一个 root 内天然按用户隔离。不同用户复用同一个 memory 实例或同一 base_path，仍会读到同一棵文件树。宿主需要根据已认证身份选择实例或 root，而不是让模型自行填写一个 `user_id` 就视作授权完成。

## 托管副本：按路径比较三个状态

[`_AttachedStore`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L125-L141) 保存最后一次确认的 `baseline`、失败内容的 `refused_shas`、等待确认的 `pending_deletes` 与响应未知的 `sent_shas`。[`_sync_path`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L616) 比较基线、本地 hash 和远端 hash：

| 变化 | 客户端选择 | 需要理解的边界 |
| --- | --- | --- |
| 只有远端变 | 拉取新内容 | 本地副本不是独立事实来源 |
| 只有本地变 | 携带条件上传 | 远端并发更改可使请求冲突 |
| 两端都变 | 记录警告并采用远端 | 没有在此处让 LLM 合并语义 |
| 服务端拒绝某内容 | 记住被拒 hash，内容改变后再试 | 其他文件继续同步，不能以会话成功推导全部文件成功 |
| 上传响应丢失 | 下一轮 listing 对账 sent hash | 网络失败不等于服务端没写入 |

远端 [`Memories.update`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/resources/beta/memory_stores/memories.py#L229-L278) 暴露 `precondition`，契约说明条件不满足返回 409。这里只核验客户端参数和处理逻辑，没有独立证明服务端存储引擎的原子实现。

## 删除不是简单地发现文件不见就传播

[`SessionMemoryStores` 的删除控制](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L40-L103) 包含 enabled/log_only/disabled 模式、30 秒缺失确认窗口、单轮删除上限和 store marker 检查。默认同步间隔 15 秒，最小 5 秒；`sync_if_due` 是按调用点检查经过时间，不是该对象自行启动一个持续后台计时线程。`finish` 的最终同步可以免去等待窗口，因而不能声称所有删除都至少等待 30 秒。

[`_sync_store/finish`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L342-L450) 与 [`_sync_path`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L616) 还体现一个关键取舍：远端删除而本地存在未上传修改时，可写 store 会重新创建该记忆，以保住唯一副本；只读 store 留下未同步文件。若产品承诺“删除后永不回来”，就不能仅调用远端删除而忽略活跃副本与同步模式。

普通本地工具的 [`delete/clear_all_memory`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_beta_builtin_memory_tool.py#L575-L620) 则直接删除文件或目录。它不清理已经发给模型的工具结果、外部备份或其他系统副本。托管 API 还分开提供 [`memory_versions.redact`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/resources/beta/memory_stores/memory_versions.py#L261)：删除当前记忆和处理历史版本是不同表面，不能把前者描述成全部历史擦除。

整棵本地副本消失还有额外保护：[`_sync_store`](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/src/anthropic/lib/tools/_memories.py#L373-L400) 发现目录连 marker 一起被清空，或基线至少两份文件而当前全部消失时，会重新下载而不是把本地 wipe 传播为远端全删。只有一份基线文件且 marker 仍在时不满足第二项条件，仍可能走单文件删除确认。因而“删掉副本目录”与“通过服务接口删除 store”是不同产品动作。

## 已读测试与尚未验证

本轮定向阅读文件工具的 [CRUD、换行与路径测试](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/tests/lib/tools/memory_tools/test_filesystem.py)，以及同步的 [基本对账](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/tests/lib/tools/memory_sync/test_memory_sync.py)、[丢失响应](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/tests/lib/tools/memory_sync/test_lost_response.py)、[保留唯一副本](https://github.com/anthropics/anthropic-sdk-python/blob/4c7b598466b88559583f98216139be8e9b34c1fc/tests/lib/tools/memory_sync/test_keep_only_copy.py) 场景。它们帮助确认设计意图，但没有作为本轮运行通过的结果。下一步最有价值的实测是两写入者同改一文件、响应丢失后再编辑、远端删除时本地离线修改，以及会话终止时最后一次同步。

## 自测

1. 单文件原子替换为什么仍不能保证两个编辑者的修改都保留？
2. 为什么远端删除成功，下一次同步却可能出现同一路径的记忆？
