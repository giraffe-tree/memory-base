---
id: projects.memobase.overview
title: Memobase 用用户画像与事件记忆构成独立服务
summary: 区分 HTTP 服务、持久数据库、缓冲刷新和 MCP 适配，说明用户中心记忆的适用边界。
project: memobase
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/server/api/api.py
  - src/server/docker-compose.yml
  - src/server/api/memobase_server/models/database.py
  - src/server/api/memobase_server/api_layer/blob.py
  - src/server/api/memobase_server/controllers/modal/chat/__init__.py
  - src/server/api/memobase_server/controllers/context.py
  - src/mcp/src/main.py
  - src/server/api/memobase_server/env.py
---

## 它负责什么

Memobase 当前研究版本 `358c16bbc6d687937d79bc2f984a11c3be8da901` 是带 FastAPI 服务端、客户端和 MCP 适配器的用户记忆系统。它把对话先存成 blob，再批量提炼为主题画像和事件片段；读取时组合这两类信息，供外部聊天应用使用。核验日 2026-11-07，固定提交时间为 2026-01-11，不能将其当作未来托管服务全部行为。本轮只读源码，未安装、启动或调用模型。

[FastAPI lifespan](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/api.py#L24-L38) 初始化 Redis 并检查模型与 embedding；[Compose](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/docker-compose.yml#L1-L67) 明确列出 Postgres/pgvector、Redis 和 API。SDK 函数主要通过 HTTP 请求这台服务，不是把完整记忆逻辑嵌入每个客户端。服务可以自己部署；配置模型端点后，生成与 embedding 仍可能在外部模型服务执行，部署位置不能由数据库位置代替描述。

## 用画像压缩稳定信息，用事件保存经历

假设用户说“我在 alpha 项目负责后端，最近改用 Rust”。GeneralBlob 的 JSONB 保存输入。后续处理可把“负责后端”放到 topic/sub_topic 画像槽位，同时生成描述这次变化的事件。UserProfile 保存 content 与 attributes；UserEvent 保存 event_data 和可选 embedding；UserEventGist 则把事件摘要分成可单独召回的片段，并保留 event_id 外键。[数据库模型](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/models/database.py#L307-L627)

这是一种用户中心的结构：用户和项目贯穿各表，而非默认以项目知识文件或实体关系图为主。画像适合持续压缩当前偏好和背景，事件适合回答“之前发生过什么”。它们可以互补，但画像更新是否保留了足够历史，要检查事件实际包含的信息，不能仅凭两张表认定具备完整事实版本链。

## 数据流有三个完成点

第一步是插入原始 blob 并提交数据库。第二步是增加 buffer 记录，按 token 阈值判断是否需要处理；默认 wait_process=False，超过阈值时安排 BackgroundTasks。第三步才是提取并保存画像与事件。[HTTP 插入链](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/api_layer/blob.py#L14-L98)

因此 insert 返回 ID 不等于新事实已经能在 context 中找回；即使传 wait_process=True，低于自动触发阈值时也不因此强制执行 flush。需要即时可读的应用应明确调用 flush，并检查其结果。一次输入、缓冲持久化和提取完成要分别观测。

[process_blobs](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/modal/chat/__init__.py#L40-L136) 先把聊天压缩为 memo，再并行计算画像变更与事件标签，之后先存事件、再落画像。这里实际导入的是 merge_yolo，而非同目录旧 merge 实现。阅读同名文件时必须沿 import，不能把未走到的旧分支描述为默认机制。

## 谁把记忆放进模型

context 控制器并行取画像与事件 gist，按 token 预算分配、截断，然后返回带模板的字符串。它不代替宿主完成最终聊天回复。宿主仍要决定把 context 放到 system、developer 还是其他消息中，以及怎样处理它与用户当前要求的冲突。[上下文组装](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/controllers/context.py#L125-L222)

MCP 表面使用 FastMCP，将 save_memory、get_user_profiles、search_memories 转为对 SDK 的调用，底层仍要连接 Memobase HTTP 服务。save_memory 会先 insert 再 flush；search_memories 则调用 context，而不是直接暴露一个通用向量数据库。[MCP 实现](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/mcp/src/main.py#L15-L78) 这里的 MCP 工具、SDK 函数、HTTP 控制器和数据库查询是四个不同层次。

## 原始材料不是默认永久档案

默认 persistent_chat_blobs=False；处理成功后，buffer 流程可以删除聊天 blob。因此原始输入是提取前的材料，但不一定是处理后仍然保留的事实来源。数据库持久化不自动等于完整来源可追溯。[配置默认值](https://github.com/memodb-io/memobase/blob/358c16bbc6d687937d79bc2f984a11c3be8da901/src/server/api/memobase_server/env.py#L77-L104) 对需要审计、重新提取或核对误记的产品，应明确开启保留或独立保存输入，并验证来源到画像的关联范围。

## 采用条件与待验证项

适合聊天产品、个性化助手和需要稳定用户背景与近期经历的应用，尤其是愿意围绕 topic/sub_topic 定义画像规则的团队。其优势是服务边界、画像整理和上下文预算已有实现；采用代价是 Postgres、Redis、模型配置和后台处理运行责任。

根据模型与控制流推断，复杂组织关系、跨用户共享知识和可回放任务经验需要额外建模，不能由现有用户画像接口直接推出。上线前应验证阈值刷新延迟、模型提取误差、失败任务恢复、用户隔离与删除传播。本轮没有复现仓库宣传分数，也没有获得托管版与开源版同环境效果对比。

## 自测

1. insert 成功却读不到新记忆，可能卡在哪两个完成点之间？
2. MCP 的 save_memory 为什么仍需要一个可访问的 Memobase 服务？
