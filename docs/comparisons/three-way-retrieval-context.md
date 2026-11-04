---
id: comparisons.three-way-retrieval-context
title: “找回记忆”在三套系统里是不是同一个操作？
summary: 分开比较分块检索、事实排序、core预置、deferred路径读取与历史消息搜索，保留Cloud未知边界。
project: comparison
projects:
- reme
- mem0
- letta
minutes: 12
status: source_verified
prerequisites:
- projects.reme.retrieval-context
- projects.mem0.retrieval-context
- projects.letta.retrieval-context
sources:
- project: reme
  path: reme/steps/index/search.py
- project: reme
  path: reme/components/agent_wrapper/as_agent_wrapper.py
- project: mem0
  path: mem0/memory/main.py
- project: mem0
  path: mem0/utils/scoring.py
- project: letta
  path: src/tools/impl/memory.ts
- project: letta
  path: src/backend/local/transcript-search.ts
- project: letta
  path: src/backend/local/system-prompt-compilation.ts
- project: letta
  path: src/backend/message-search.ts
- project: letta
  path: src/backend/api/search.ts
- project: reme
  path: reme/config/default.yaml
---

## 结论：先对齐信息对象，再比较检索

ReMe的Search、Mem0的search、Letta的Memory与message search不处理同一类信息对象。不能因为都有“记忆”和“查询”，就把候选、分数或返回条数直接并排排名。下表每一项附对应固定版本的实际入口。

| 问题 | ReMe证据 | Mem0证据 | Letta证据 |
| --- | --- | --- | --- |
| 查什么 | 默认监听daily／digest分块及来源。 [index_update_loop](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml) [SearchStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py) | 向量store中的事实项payload。 [_search_vector_store](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | Memory读deferred路径；历史检索另读transcript或远程API。 [searchMessagesForBackend](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts) [Memory路径工具](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) |
| 候选与排序 | 默认BM25，双路结果都有时按chunk ID做RRF。 [file_store.default](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml) [_rrf_merge](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py) | 只有semantic候选，再前置门控和加分。 [score_and_rank](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py) | local transcript扫描与BM25，明确拒vector/hybrid；Cloud内部未知。 [searchLocalTranscriptMessages](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/transcript-search.ts) |
| 供给时点 | 搜索结果需宿主加入实际请求。 [工具结果桥接](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py) | 事实项与score_details返回，宿主决定供给。 [Memory.search](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | local已提交root预先编译system，deferred读取结果另供给。 [Memory返回读取结果](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts) [compileLocalSystemPrompt](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts) |
| 状态与范围 | 可选tool_context_id记录已返回chunk与TTL。 [_dedupe_tool_context](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py) | scope过滤、过期和候选上限分别作用。 [Memory.search](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py) | backend能力决定本地／API；请求参数不是Cloud算法证据。 [searchMessagesForBackend](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts) |


## 用一个问题观察三条供给路径

问题是“alpha目前用什么语言”。ReMe可以检索更新后的项目笔记再读来源；Mem0可以在相同scope中检索相关事实，仍需判断新旧时间语境；Letta可能已经把当前状态放进core，也可能需要按索引阅读deferred细节或检索历史。

如果Letta在不调用search时回答正确，应先检查预置core，而不是宣布检索零成本或整个系统没有读取记忆。反过来，如果工具能读到工作树Rust而system仍是已提交Python，应查提交和投影时点，而不把矛盾简单归为模型幻觉。

## 算法证据能支持到哪里

ReMe双路RRF根据排名贡献，而Mem0归一加分依赖候选语义分数、BM25和entity信号，threshold先作用于semantic。Mem0局部实验已用合成信号验证门控与分母行为，但没有测真实向量后端质量。

Letta本地 [searchLocalTranscriptMessages](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/transcript-search.ts) 遍历会话记录，按日期、agent／conversation和hidden过滤，计算排名，并对当前搜索回声等情况单独处理。这个实现明确拒绝vector/hybrid；不能将API模式允许同名search_mode的请求字段视为本地能力。

远程 [searchMessages](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/search.ts) 只是发送POST /v1/messages/search。客户端路径可核验，Cloud具体排序、索引和执行拓扑不在本轮可见范围。本文不会把这一缺口写成“不支持”，也不会写成“已经使用某个完整算法”。

## 比较预算与错误定位

应分别记录原始材料量、core大小、query与embedding、候选数、返回片段、读取轮次和最终模型输入。一个系统预置core、另一个每次检索事实时，单比一次search延迟会遗漏不同阶段成本。

没有拿到所需材料，可能表现为空结果、异常或截断。ReMe可能无命中或已返回去重；Mem0可能被scope、semantic门控或过期过滤排除；Letta不存在路径或不支持的vector/hybrid模式会抛错，内容截断通常仍返回内容与notice，消息过滤才可能减少结果。排障要分别读源码分支和实际响应，不能都当作空搜索。

## 本轮实测边界

Letta新增20个样本仅执行格式、frontmatter和树约束helper，没有执行历史BM25、Memory读取、Git投影或远程请求。对比页状态是源码核验，不能因链接到局部实验就整体改成端到端验证。后续要以相同任务目标分别记录供给路径，才能讨论回答正确率或成本。


## 源码定位

- [reme · reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)
- [reme · reme/components/agent_wrapper/as_agent_wrapper.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py)
- [mem0 · mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)
- [mem0 · mem0/utils/scoring.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)
- [letta · src/tools/impl/memory.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts)
- [letta · src/backend/local/transcript-search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/transcript-search.ts)
- [letta · src/backend/local/system-prompt-compilation.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/local/system-prompt-compilation.ts)
- [letta · src/backend/message-search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/message-search.ts)
- [letta · src/backend/api/search.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/search.ts)

- [reme · reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)

## 自测

1. 为什么Letta已经预置的core不应与Mem0一次search返回条数直接比较？
2. 看到远程请求接受hybrid参数，为什么仍不能断言本地或Cloud内部算法已核验？
