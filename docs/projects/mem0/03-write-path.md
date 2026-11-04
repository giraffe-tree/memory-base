---
id: projects.mem0.write-path
title: 当前 Mem0 怎样把新消息新增为记忆？
summary: 跟踪 ADD-only 抽取、局部哈希去重、批量写入与部分失败，区分原文写入和旧版 CRUD 流程。
project: mem0
minutes: 11
status: source_verified
prerequisites: [projects.mem0.memory-model]
sources:
  - mem0/memory/main.py
  - mem0/configs/prompts.py
  - mem0/memory/storage.py
  - tests/memory/test_main.py
---

## 结论：普通推断路径只新增

在本基线 Python OSS 中，`add(infer=True)` 会查询已有相关记忆，再以 `ADDITIVE_EXTRACTION_PROMPT` 做一次常规抽取调用，最终只为接受的事实创建新记录。它不是先提取事实、再让另一个 LLM 从 ADD、UPDATE、DELETE 中选择动作的旧流程。

核验基线为 `ed1f10fc87080f0b67f99be370817504888462ab`，日期 2026-11-04；本页为源码核验，未调用真实模型。上游 add docstring 仍提“决定更新删除”，此处以实际执行分支为准。

## 先区别三条入口

一般事实走 `infer=True`；`infer=False` 则逐条保存非 system 消息，记录 role 和存在时的 name/actor，不做同样的 LLM 抽取。后者仍需 embedding，并非完全无模型或数据库成本。

传入 procedural memory type 且具有 agent ID 时，还有单独的过程记忆总结分支。它不代表普通新增自动生成可执行技能；本章聚焦一般事实链路，其他分支需要分别验收。

## 一次新增的八个阶段

假设提交“今天决定 alpha 先用 Python，Rust 留待压测后评估”。scope 校验和消息格式准备后，程序执行：

```text
近期10条消息 + 本次消息
  → 同scope向量查询，取相关旧记忆10条
  → 旧记忆作为上下文，一次 ADD-only LLM 抽取
  → 解析 JSON 的 memory 列表
  → 批量 embedding，失败则逐条尝试
  → 文本MD5去重与payload生成
  → 批量插入，失败则逐条尝试
  → 历史与实体关联 → 保存近期消息 → 返回已确认写入项
```

已有记忆被映射为短整数 ID 放入提示，减少模型编造 UUID 的机会。它们用来提供背景和避免重复，不是允许模型原地修改的数据库句柄。新记忆应来自本次消息；历史材料是否被错误再提取，仍需质量实验。

默认提示还从 user 和 assistant 两种角色抽取有价值信息，要求区分“用户陈述”和“曾被建议”。宿主必须确认这种采集范围是否符合产品预期；模型建议不应未经确认就变成用户真实经历。

## 去重的实际覆盖范围

程序计算每条抽取文本的 MD5，比较本次向量召回的旧记忆 hash，并用本批 `seen_hashes` 去掉重复文本。这是精确文本层的辅助去重。语义近似是否应跳过主要由抽取提示判断。

旧 hash 集合只来自 top-10 相关召回，不是查询整个 scope 的唯一约束。远处未召回的相同文本仍可能再次插入；并发批次也没有跨 vector store 和 SQLite 的唯一提交协议。没有稳定 request_id 成功回执的这条路径，不能写成“同一请求重复提交必然幂等”。

## 哪些失败抛出，哪些会降级

LLM 调用失败会包装为 `LLMError` 抛出，使上游能区分提供商不可用。JSON 解析失败却会记录日志、按无提取结果处理，并保存近期消息后返回空结果。因此空 `results` 可能意味着没有值得提取的事实，也可能意味着解析失效，排障需要日志或更细观察。

batch embed 失败会逐文本重试；batch insert 失败会逐记录写入。只有代码确认写入成功的记录进入返回值、历史记录和实体关联。如果所有候选写入都失败，抛出 `VectorStoreError`；部分成功则可以只返回成功子集，不能把输入条数当成实际保存条数。

向量写入之后，SQLite 历史批写失败还有逐条回退，实体关联失败通常仅告警。这意味着正文可已存在，而辅助历史或实体链接尚不完整。最后消息保存若失败，调用也可能在已有正文副作用后报错。整个流水线没有跨这些存储的统一回滚。

## 接到宿主以后怎样验收

先比对输入、抽取文本与实际主记录，再检查 history、近期消息和实体关联是否一致。随后针对重复提交、解析错误、单条 embedding 失败与部分 insert 失败观察返回边界。最后再做跨会话检索和回答检查；一次 add 返回 ADD 不能替代完整记忆协作验收。

## 源码定位

- [新增主线和失败回退](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`Memory.add`、`_add_to_vector_store`、`AsyncMemory.add`。
- [ADD-only 提示与输入组织](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/configs/prompts.py)：`ADDITIVE_EXTRACTION_PROMPT`、`generate_additive_extraction_prompt`。
- [SQLite 保存边界](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)。
- [上游 Memory 单元测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/memory/test_main.py)：用于查找新增、同步与异步行为的测试样本；本页未运行。

## 自测

1. 本次 ADD-only 流程为什么仍查询旧记忆？这能保证全库去重吗？
2. add 返回空列表、返回部分记录和抛异常，分别可能对应哪些失败位置？
