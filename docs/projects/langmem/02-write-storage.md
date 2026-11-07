---
id: projects.langmem.write-storage
title: LangMem 如何先召回旧记忆，再提取并写回
summary: 沿 MemoryStoreManager 追踪候选检索、结构化提取、ID 映射、多阶段整理和非事务写入。
project: langmem
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/langmem/knowledge/extraction.py
  - src/langmem/knowledge/tools.py
---

## 写入不是直接追加整段聊天

固定版本 `8620b986af5b0c7593e6b7fbece2998690d22d15` 的 MemoryStoreManager 采用“查旧记录 → 结构化提取 → 可选整理 → 差异写回”。这条链路和 Agent 主动调用的 manage_memory 工具不同。本文是 2026-11-07 的静态源码核验，未运行模型或 Store。

默认 `Memory` 模型只有 content 字符串；`ExtractedMemory` 是 ID 与内容的组合。StoreManager 写入时另包一层 `{kind, content}`，kind 对应 schema 名称。namespace 与 key、created_at、updated_at 由 Store Item 承载；原始会话 ID、逐条证据位置、事实有效时间不是默认 Memory 字段，业务要显式扩展 schema 或另存来源。[数据类型](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L64-L94)

## 沿一次事实更正追踪

输入“alpha 现在改用 Rust”，StoreManager 先在当前 namespace 查找可能相关的旧记忆。提供 query_model 时，会额外调用模型生成若干搜索工具参数，再并行执行 Store 搜索；否则从对话的不同窗口构造查询。[异步入口](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1008-L1137)

多路结果按 `(namespace, key)` 去重，按 Store 分数降序截取 query_limit；分数缺失按负无穷处理。随后把 Store 地址转换成 UUID5 稳定 ID，供提取器引用。这里稳定的是既有记录的地址映射，不是“同义输入一定得到相同新 ID”。[稳定 ID 与排序](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L936-L1006)

随后 MemoryManager 将消息和既有记录交给 Trustcall `create_extractor`，schema 定义模型能返回的结构；已有记录可被更新，也可输出 RemoveDoc。新条目没有既有 ID 时生成 UUID4。max_steps 默认 1，允许多步时从第二步加入 Done 工具，并把前一步结果反馈给模型。[提取循环](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L217-L345)

这里有三个不同入口的默认值：独立 MemoryManager 的 enable_deletes=False；直接构造 MemoryStoreManager 时为 True；常用工厂 create_memory_store_manager 则为 False，并把该值传给构造器。因而不能从类构造参数推导工厂调用的默认行为，评测要记录实际入口和有效配置。[独立管理器](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L217-L227)、[直接构造器](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L832-L851)、[工厂参数](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1666-L1681)

## 多阶段整理发生在落盘前

提取后的结果先分成两组：已经映射到 Store 的旧记录与尚未持久化的新记录。可配置 phases 依次执行独立的 MemoryManager；每阶段可以决定是否携带原消息，也可以只对上一阶段记忆做去重、合并或丰富。程序维持 removed_ids，删除项不再进入最终 put 集合。[结果归并与阶段构建](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L936-L1006)

若某个旧记录内容与 kind 都没有变化，就不产生 put；变化时沿原 namespace/key 覆盖；新记录则写到当前 namespace。删除也只根据 store_map 找回旧地址。由此可见，冲突解决范围受第一次候选召回限制：没被搜到的旧说法没有机会参与这次更新。这是源码机制推断，仍需用实际 embedding 和样本测量漏召回率。[差异写回](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1008-L1137)

如果没有候选且配置了 default_factory，程序会先把默认记忆写到 `default` 键，再执行提取。因而提取失败时也可能已经留下默认记录；不能把整个 invoke 视作直到成功返回才产生状态变化。[默认值分支](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1008-L1137)

## 完成点与失败边界

异步实现使用 asyncio.gather 并行 put 与 delete，没有在该层创建跨操作事务。一个操作异常时，其余已经完成的操作不由此自动回滚。同步实现把任务提交给 executor；本轮看到的代码段未逐个读取写入 Future 的 result，因此也不应声称所有后端写入错误都必然经 invoke 返回。[异步落盘](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1008-L1137)、[同步提交](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/extraction.py#L1245-L1281)

重复调用同一输入可能因候选命中被合并，也可能创建新的 UUID；管理器未建立请求幂等键。并发更新是否覆盖、事务是否可用、索引何时可见，由宿主与具体 Store 共同决定。代码中没有通用的版本比较后交换或原始输入日志可替它保证幂等重放。

主动工具路径又有不同格式：create 会拒绝用户提供 ID，再生成 UUID4；update/delete 必须提供 ID；保存值是 `{content: ...}`，没有 StoreManager 默认的 kind 包装。因此组合两种写入入口时要统一 schema 与 namespace，不能仅因都使用 BaseStore 就假设记录能无缝互读。[工具落盘](https://github.com/langchain-ai/langmem/blob/8620b986af5b0c7593e6b7fbece2998690d22d15/src/langmem/knowledge/tools.py#L263-L337)

## 采用与验证

这种设计方便把记忆 schema 和模型决策留在应用内，但应用必须明确事实来源、候选窗口、重试和并发策略。建议用“Python → Rust → 重复 Rust”以及两次并发更正测试，分别检查候选、提取动作、Store 最终值和返回结果；这只是待验证方案。本轮没有执行上游测试，也没有证明自动整理提高了回答质量。

写入验收还应记录每个新条目的 ID、命中的旧候选和实际删除地址。否则只看到最终文本从 Python 变为 Rust，无法区分原键更新、另建一条矛盾记忆、或删除旧记录后重新创建。这三种结果对审计、关联引用和后续重试的影响不同。

## 自测

1. UUID5 稳定映射为什么不等于重复输入的请求幂等？
2. 若写入前只搜到五条候选，为什么无法据此保证全库旧事实都已更新？
