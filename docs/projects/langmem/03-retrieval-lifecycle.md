---
id: projects.langmem.retrieval-lifecycle
title: LangMem 的检索、反思和遗忘由哪些层协作
summary: 区分直接 Store 搜索、模型规划搜索、本地后台反思、远程运行与应用隔离。
project: langmem
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/langmem/knowledge/tools.py
  - src/langmem/knowledge/extraction.py
  - src/langmem/reflection.py
  - src/langmem/utils.py
  - tests/test_docstring_examples.py
  - src/langmem/short_term/summarization.py
---

## 检索工具不决定最终回复

固定版本 `8620b986af5b0c7593e6b7fbece2998690d22d15` 中，create_search_memory_tool 从运行时或构造参数拿到 Store，以 namespace、query、filter、limit、offset 调用 search，随后返回 JSON 字符串，或字符串与原始 artifact。[搜索工具](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py#L433-L497) 相似度算法、embedding、过滤语义和索引更新由具体 Store 实现，不能只看 LangMem 接口就声称其统一采用某种向量数据库。

Agent 决定何时调用这个工具，宿主把工具结果纳入会话，回答模型再生成回复。直接调用 manager.search 则只是应用函数，返回结构化结果，不会自动创建聊天消息。两者都不能证明最终答案已经采用正确记忆。[管理器查询](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1353-L1478) 本文核验日为 2026-11-07，只读源码与测试文件，未运行服务或质量评测。

create_memory_searcher 还提供模型规划的搜索：绑定 search 工具，模型产生并行查询，合并结果时按 namespace/key 去重。它增加了一次查询规划模型调用，价值应由多跳检索收益与成本共同验证，不能把模型参与本身当作效果保证。[搜索器组合](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L778-L815)

## 后台反思的真实生命周期

本地 LocalReflectionExecutor 启动非 daemon 线程，使用 PriorityQueue 按计划执行时间处理任务。submit 返回 Future，after_seconds 延迟执行；相同 thread_id 的新任务会设置旧任务取消事件并尝试取消 Future；正常 worker 循环检查这些状态，以减少重复执行。[本地执行器](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L254-L387)

例如用户连续补充“改用 Rust”“仅限服务端”，宿主可延迟几秒，把较完整消息提交反思，减少对每段碎片分别提取的次数。但正常循环跳过取消任务不等于强制中断：已经进入 reflector.invoke 的模型调用没有检查该取消事件的中断机制，不能据此承诺运行中的模型调用或落盘已撤销。[队列处理](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L401-L474)

任务队列和 pending 字典在内存中，正常执行异常写入 Future。shutdown 先把 worker_running 设为 False；cancel_futures=True 会设置取消事件并取消 pending Future，但 worker 退出循环后的 drain 分支没有重新检查 future.cancelled 或 cancel_event，仍调用 reflector.invoke。因此该选项不能保证停止尚在队列中的写入；这只是固定版本的静态控制流风险，本轮未复现。[shutdown](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L369-L379)、[退出排空分支](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L451-L471)

它也不是持久任务队列，进程被强制终止后没有仅靠此队列恢复工作的保证。工程接入应保留 Future、收集异常，并把取消后是否仍会落盘列为待验证项；提交成功、Future 已取消和持久状态停止变化是不同信号。

远程 RemoteReflectionExecutor 则使用 LangGraph SDK 调用 runs.create，设置 multitask_strategy="rollback"、after_seconds 和命名空间配置；搜索经远程 store.search_items。这里的网络调用不是进程内函数，也不是 MCP。远端持久性与调度语义应结合实际 LangGraph 服务验证，不能由本地线程实现推导。[远程执行器](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/reflection.py#L143-L244)

## 更新、删除与压缩分层

直接管理 API 允许 put、delete，并在 put 上转发 index 与 ttl。delete 作用于 namespace/key；它不遍历宿主 transcript、摘要、用户备份或模型已接收的上下文。索引删除与 TTL 具体行为取决于 Store。若业务需要“撤回某条经历产生的全部记忆”，还需保存来源关系和衍生记录清单。[CRUD 表面](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1353-L1478)

短期 SummarizationNode 位于独立模块，负责对长消息历史进行摘要和裁剪；它不是长期 Store 的自动回收器。会话摘要可能仍包含已删除事实，应用需要定义摘要刷新或失效规则，不能把长期记录删除和上下文清理混为一次操作。[短期摘要模块](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/short_term/summarization.py#L1)

## 隔离、测试与成本

NamespaceTemplate 只从 configurable 替换路径变量，缺少变量时失败；它没有校验配置来自哪个登录主体。服务应从可信身份导出用户与项目 namespace，而不是把任意请求字段当成授权。Store 本身的权限也应覆盖应用可以调用的直接搜索路径。[模板实现](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/utils.py#L73-L91)

仓库存在文档示例测试和短期摘要测试，文档测试会执行示例片段；这类测试能检查接口示例，却不能替代长期记忆的冲突、撤回和跨会话回答评测。[测试入口](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/tests/test_docstring_examples.py#L1) 本轮没有安装依赖、调用模型或运行这些测试，未取得准确率和性能数字。

从调用链推断，成本包括：提取模型、可选查询模型、每个 phase 的整理、Store embedding，以及检索材料占用的回答 token。后台执行能移开前台等待，仍会产生调用费用与可见性延迟。建议把“反思已排队、Store 已写入、下次读取命中、回答正确”分别记录，再决定是否使用延迟与多阶段整理。

实际业务还要保存检索 query、namespace 和返回的记录键，才能判断错误来自查询范围、索引召回还是回答模型。若只统计最终答案，将难以区分“事实未写入”与“事实写入后没有供给”。这种分层观测是本文建议的验收方式，不是已运行的实验结果。

## 自测

1. 新 submit 取消旧 Future，为什么不等于撤回已经写入的记忆？
2. 删除 Store 记录以后，哪些地方仍可能保留同一事实？
