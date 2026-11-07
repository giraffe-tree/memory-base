---
id: projects.memobase.write-storage
title: Memobase 从 blob 到画像与事件如何落盘
summary: 跟踪两次入库、token 缓冲、模型整理、pgvector 写入与跨阶段部分成功。
project: memobase
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/server/api/memobase_server/controllers/blob.py
  - src/server/api/memobase_server/controllers/buffer.py
  - src/server/api/memobase_server/controllers/modal/chat/__init__.py
  - src/server/api/memobase_server/controllers/modal/chat/merge_yolo.py
  - src/server/api/memobase_server/controllers/event.py
  - src/server/api/memobase_server/controllers/profile.py
  - src/server/api/memobase_server/models/database.py
  - src/server/api/memobase_server/env.py
---

## 写入链路的关键结论

固定版本 `358c16bbc6d687937d79bc2f984a11c3be8da901` 把输入接收、缓冲、模型加工、事件保存和画像保存拆成多个阶段。它提供部分失败状态，但没有用一个数据库事务把整条链包起来。因此“失败后重试”必须检查已经写入哪些派生数据。以下为 2026-11-07 静态源码核验，未运行数据库或模型。

## 两次提交后才进入提取

controllers.blob.insert_blob 先校验 BlobData，构造 GeneralBlob，保存 blob_type、JSONB blob_data、additional_fields、user_id 与 project_id，提交后返回随机 ID。[原始 blob](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/blob.py#L10-L27) buffer.insert_blob_to_buffer 再单独提交 BufferZone，记录 blob_id、token_size、状态 idle 和用户项目。[缓冲写入](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py#L33-L94)

如果第二次提交失败，第一次保存的原始输入不会自动回滚。重复提交同一文本也没有在这个入口生成内容幂等键；若客户端因超时重试，可能得到两个 blob。后续画像合并可减少语义重复，但不等于接收层实现请求恰好一次。

自动触发使用 idle 缓冲总 token 数，严格大于配置阈值才返回处理 ID。默认阈值 1024，单批最大处理输入 16384 token；配置值可以覆盖。[阈值判定](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py#L33-L94)、[默认配置](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/env.py#L77-L104) 不能把小输入写入成功理解为马上触发提取。

## 模型做什么，程序做什么

flush_buffer_by_ids 按 user/project/type/status 读取 buffer 并 join GeneralBlob，先把状态改为 processing 并提交，再离开 session 运行模型处理。process_blobs 从新到旧保留不超过 token 上限的连续尾部，先 entry_chat_summary，再调用 extract_topics 和 merge_yolo；profile 与 event 标签处理并行。[刷新入口](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py#L117-L259)、[处理主线](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/modal/chat/__init__.py#L40-L136)

以“项目由 Python 改为 Rust”为例，提取器生成带 topic/sub_topic 的事实；merge_yolo 用同一主题槽位匹配旧画像，把新旧内容及槽位说明交给 LLM。程序解析动作形成 add/update 等中间集合。首次新槽位在未要求验证时可以直接加入，不必每条都再次验证；其余合并决策仍受模型与提示影响。[合并实现](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/modal/chat/merge_yolo.py#L14-L162)

整理与超长槽位重摘要失败时，主线记录错误后继续返回中间画像；不能把每个整理步骤都称为强制写入门槛。模型提取结果是否忠于原话，需要样本评测，结构解析成功只是最低一层有效性。[画像处理阶段](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/modal/chat/__init__.py#L40-L136)

## 数据与索引存在哪里

UserProfile 是 SQL 文本加 JSONB attributes；UserEvent 包含事件摘要、标签、profile_delta 和向量；UserEventGist 由事件摘要中以 `-` 开头的行生成，分别保存 gist 内容与 embedding，外键关联事件。向量使用 Postgres 的 pgvector Vector 列，没有另一个必需的独立向量服务。[模型](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/models/database.py#L307-L627)、[事件落盘](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/event.py#L68-L164)

事件和所有 gist 在一个 session 中提交；embedding 调用失败时可退化为 None 后继续存事件。于是“事件已经保存”和“事件能参与语义检索”是不同状态：检索会排除没有向量的条目。该降级提高了写入可用性，却需要补偿或重建策略，不能默认声称失败向量会自动补齐。

## 部分成功与恢复风险

主线先 append_user_event，再 add_update_delete_user_profiles。后者在单个数据库事务里合并画像新增、修改与删除，异常回滚；但事件保存与画像事务之间没有共同事务。若画像保存失败，事件可能已经提交。[提交顺序](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/modal/chat/__init__.py#L40-L136)、[画像事务](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/profile.py#L226-L316)

flush 成功后标记 done；失败时标记 failed，异常也会更新为 failed。若 persistent_chat_blobs=False，成功后还会删除原始聊天 blob，其关联 buffer 可随外键关系删除。因此“done 状态长期可查询”也不能无条件承诺。[状态与清理](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer.py#L117-L259)

同步 flush 源码直接保留“并发调用可能重复 flush”的 FIXME。后台 Redis 锁提供另一层串行化，但不能据此替同步入口承诺相同保证。重试某个 failed 批次时，要测试已提交事件是否重复、新画像是否覆盖以及输入是否还在；本文只提出失败边界，没有观察到真实恢复结果。

对需要重新提取的业务，建议同时记录原始输入的外部稳定编号、批次编号、提取配置和最终事件编号。当前默认数据模型并未给每条画像提供逐句来源指针；事件中的画像变化也不能完整代替原话。配置是否保留聊天应在首次部署时就确定，并用实际删除后的数据核对，避免直到审计时才发现材料已被清理。

## 自测

1. 为什么图片化地把所有步骤画成一次事务，会掩盖事件先写成功而画像失败？
2. embedding=None 的事件，在按时间读取和向量搜索中会有怎样的可见性差异？
