---
id: projects.memobase.retrieval-lifecycle
title: Memobase 怎样组装上下文，更新与删除传播到哪里
summary: 分析画像过滤与事件 gist 检索、Redis 后台队列、删除不对称和 HTTP/MCP 的隔离边界。
project: memobase
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/server/api/memobase_server/controllers/context.py
  - src/server/api/memobase_server/controllers/event_gist.py
  - src/server/api/memobase_server/controllers/profile.py
  - src/server/api/memobase_server/controllers/event.py
  - src/server/api/memobase_server/controllers/blob.py
  - src/server/api/memobase_server/models/database.py
  - src/server/api/memobase_server/controllers/buffer_background.py
  - src/server/api/memobase_server/api_layer/middleware.py
  - src/mcp/src/main.py
  - src/server/api/tests/test_api.py
---

## 画像与事件走两条检索路

固定版本 `358c16bbc6d687937d79bc2f984a11c3be8da901` 的 context 并行处理画像和事件 gist。画像先从缓存或数据库取得全集，有聊天且未要求全画像时可用模型筛相关项，再按主题偏好、主题限定、子主题长度与 token 预算裁剪。[上下文主线](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/context.py#L29-L222)、[画像读取](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/profile.py#L75-L117)

事件方面，有 chats 且开启 event embedding 时，把最近三条消息文本作为查询，搜索最多 60 条 gist；否则按时间读取 gist。语义搜索先生成 query embedding，SQL 以 `1 - cosine_distance` 计算相似度，按 user_id、project_id、时间窗口和阈值过滤，并排除 null embedding，按相似度降序取 topk。[gist 搜索](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/event_gist.py#L60-L142)

最后按 profile_event_ratio 分配预算；fill_window_with_events 可让事件使用画像未用尽的空间。程序把画像和 gist 拼成 context 字符串，由外部应用注入模型。token 预算围绕正文计算，仍应实测包装提示和 tokenizer 对最终输入的影响，不能把 max_token_size 当作整个聊天请求的严格上限。[组装逻辑](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/context.py#L29-L222)

本文为 2026-11-07 静态源码核验，未执行检索、模型过滤或最终回答实验，没有质量与延迟数字。

## 更新与遗忘并不对称

画像增删改后删除 Redis 的 `user_profiles::{project_id}::{user_id}` 缓存键，后续读取重新从 SQL 装载。数据库提交与 Redis 失效是两个动作，缓存失效异常或并发读回填仍需故障测试，不能只看到 delete 命令就认定强一致。[缓存与画像删除](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/profile.py#L187-L223)

事件删除通过 ORM 删除 UserEvent；模型关系声明关联 gist 的级联删除。相比之下 update_user_event 只合并并保存 event_data，没有在该函数重新计算事件 embedding，也没有重建其 gist。[更新删除控制器](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/event.py#L167-L213)、[关系定义](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/models/database.py#L307-L627) 由此得到明确边界：更正事件正文以后，context 检索使用的 gist 可能仍保留旧说法，不能承诺更新自动同步所有检索表示。

删除原始 blob 只删除 GeneralBlob；画像和事件由独立表持有，未建立从 blob 到它们的数据库级撤回外键。因此 remove_blob 不等于撤回从该输入提取的全部事实。事件被删后，已合并进画像的内容也不会仅靠事件级联自动消失。[blob 删除](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/blob.py#L48-L61)、[模型关系](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/models/database.py#L307-L627) 产品需要自行定义删除单条来源、删除某条画像和删除用户的不同语义。

## 后台队列降低前台等待，也增加完成状态

异步刷新先在 Postgres 将实际 buffer 标记 processing，再把 ID 推入 Redis 列表。执行器用包含项目、用户与 scope 的锁键获取带过期时间的锁，逐批 lpop，执行 flush，续期并在 finally 以比较值 Lua 脚本释放。[后台执行](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/buffer_background.py#L44-L266)

这能降低同一用户后台处理并发，但不是跨 SQL/Redis 的原子提交：若 processing 提交后入队失败，代码记录日志，不在该分支把状态恢复 idle；lpop 后进程被终止也需要另行恢复。限制迭代数、运行时长和连续错误次数的退出策略不能替代持久消息确认。本轮没有验证崩溃恢复或证明后台实现恰好一次。

## HTTP 与 MCP 的身份边界

HTTP AuthMiddleware 要求 Bearer，普通项目 token 解析后把 project_id 写入 request.state；控制器据此组合路径中的 user_id 查库。这是项目级凭据，不自动等于终端用户逐人授权。尤其 ACCESS_TOKEN 未设置时，is_valid_root 对任意已提供的 Bearer 返回 True；应在部署验收里核对实际配置，而非只看 OpenAPI 声明认证。[中间件](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/api_layer/middleware.py#L115-L195)

MCP 示例默认把所有操作映射到 `string_to_uuid("user")`，不是从每个 MCP 请求动态解析用户。它通过 AsyncMemoBaseClient 连接 HTTP 服务，支持 SSE 或 stdio。这适合单用户接入起点，多用户共享之前必须增加可信身份映射与访问检查。[MCP 实现](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/mcp/src/main.py#L15-L142)

## 评测与采用代价

仓库含 API 与 controller 测试，但读过测试不等于本轮已通过，测试也不能替代真实数据下的画像准确性和回答评测。[测试文件](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/tests/test_api.py#L1) 建议分别测来源保留率、画像冲突、gist 命中、删除传播和实际回答，再附带失败样本。

从代码推断，写入成本来自摘要、主题提取、合并、整理、标签以及事件和 gist embedding；读取可再产生画像筛选模型和 query embedding。缓存与异步处理能改善部分延迟，却不会消除费用或可见性等待。若用户中心画像符合业务，Memobase 提供完整起点；若必须来源级撤回与重放，需要先补齐关联和恢复机制。

## 自测

1. 更新事件正文以后，为什么 context 仍可能返回旧 gist？
2. 只有项目 token 与路径 user_id，为什么还不能证明终端用户隔离已经完成？
