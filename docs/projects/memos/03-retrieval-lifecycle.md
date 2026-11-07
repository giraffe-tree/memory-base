---
id: projects.memos.retrieval-lifecycle
title: MemOS 怎样检索与遗忘，哪些高层适配边界需要先验证？
summary: 跨Cube搜索与具体后端分工明确，但当前SDK显式Cube选择、tree更新和删除类型存在静态适配风险；评测脚本也需固定服务与模型。
project: memos
minutes: 10
status: source_verified
prerequisites: [foundations.start.memory]
sources:
  - src/memos/mem_os/core.py
  - src/memos/memories/textual/tree.py
  - src/memos/memories/textual/general.py
  - src/memos/memories/textual/tree_text_memory/retrieve/searcher.py
  - src/memos/memories/textual/tree_text_memory/organize/handler.py
  - evaluation/scripts/run_lme_eval.sh
---

## 检索到回答的实际调用

本页固定 `d326a6419467c2205041b58533b0ebfdf4f38173`，研究 Python SDK 主线。MOSCore.search 先验证用户存在，取得其可访问 Cube，针对选中的容器并行执行 text_mem 与 pref_mem 搜索。结果按类型和 cube_id 返回，并没有在这个入口统一合成所有 Cube 的全局 top-k。session_id 显式提供时会形成过滤器；不提供时仍可能把默认会话作为 info 用于记录，两者不是同一个过滤行为。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L546-L682)

TreeTextMemory.search 创建 AdvancedSearcher，传入模型、图存储、embedding、reranker 和策略；基础 Searcher 进行 retrieve，再做 post_retrieve，full_recall 可跳过后处理。GeneralTextMemory 则直接 embed query 并按向量分数排序。不同后端、fast/fine 模式、互联网与工具/技能记忆开关会改变成本，不能把 tree 的细化搜索代价算到所有配置。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree.py#L157-L230) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree_text_memory/retrieve/searcher.py#L191-L280) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/general.py#L121-L137)

MOSCore.chat 对可访问 Cube 搜索，将 memory.memory 文本编号后拼成 system prompt，再交给 chat_llm；因此此路径不是只返回候选的记忆库。来源 metadata 并未在默认 `_build_system_prompt` 中完整呈现，若宿主需要让回答引用原文或辨别状态，应明确自定义提示和来源输出策略。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L251-L337) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L354-L388)

## 访问过滤的静态风险

当前 search 在 install_cube_ids 为 None 时使用可访问 user_cube_ids；但调用者显式给出列表后，构造 tmp_mem_cubes 的循环仅检查该 ID 是否已加载，没有在这条 SDK 路径调用 `_validate_cube_access` 或与 user_cube_ids 求交。故当同一个 MOS 实例加载了其他用户 Cube，且调用方可控制显式列表时，需要验证是否能搜索越出预期范围。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L570-L615)

这是固定版本 SDK 的静态判断，没有构造跨租户样本，也没有证明 HTTP 服务暴露同样可控参数。HTTP 鉴权、网关路由和其他 API handler 可能有额外防护，不能直接称为已复现的远程漏洞。采用时应分别测试“未指定列表”“合法列表”“已加载但无权限列表”，不要用默认路径通过来替代显式路径验收。

## 更新、归档与实际删除

数据模型能保存 archived/history，NodeHandler 对冲突提供模型融合，也可能在无法融合时比较时间做硬更新；融合分支会把旧节点标 archived 并连 MERGED_TO。它提供语义处理机制，但不能保证模型一定理解“Python 改 Rust”，也不保证所有高层更新入口调用了此机制。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree_text_memory/organize/handler.py#L76-L189)

MOSCore.update 明确对 tree_text 只记“不支持 update”的警告；TreeTextMemory.update 自身抛 NotImplementedError。因而应用不能把存在同名方法当作该后端已支持任意 ID 更正。修改应沿实际可用的反馈、重新提取或整理路径验证，避免返回控制权后误报更新成功。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L997-L1034) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree.py#L350-L351)

删除还有一个具体适配边界：MOSCore.delete 接收 memory_id: str，直接传给 text_mem.delete；而 TreeTextMemory.delete 接收 list[str]，用 for mid in memory_ids 逐项删除并捕获错误。若直接通过该 SDK 路径使用 tree_text 且传入普通字符串，按 Python 语义会逐字符迭代，而非自动包装为单元素列表。本轮未运行，因此记录为待复现的参数适配风险；不推断所有服务端删除路径均受影响。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/mem_os/core.py#L1036-L1061) [源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/src/memos/memories/textual/tree.py#L402-L410)

## 并发、评测与采用成本

高层搜索对文本与偏好使用两个线程，多个 Cube 则逐个循环；后台 scheduler 与图整理也有各自线程或队列。线程安全字典只保护容器映射，不能推出图写入、版本更新和删除具有同一全局事务。异常是否传播到调用者需要按后端检查，尤其删除循环会把单项失败写日志后继续。

上游 LongMemEval 脚本分 ingestion/search/responses/eval/metric，默认 LIB=memos-api、workers=10、top_k=20，使用服务接口与外部模型。脚本存在不等于本轮已复现分数；它也不能直接证明本文 SDK 静态风险是否会经过服务端同一路径。对比必须固定 API 版本、服务实现、模型、输入切分与调度完成条件。[源码](https://github.com/MemTensor/MemOS/blob/d326a6419467c2205041b58533b0ebfdf4f38173/evaluation/scripts/run_lme_eval.sh#L1-L44)

建议先验证访问隔离、树后端更新与删除这三类边界，再用同一来源更正样本测召回和回答。成本同时记录 Reader、图重组、embedding、fine 检索、scheduler 与回答模型；没有实测前，不以“统一记忆操作系统”这一名称推断更低 token 或更高准确率。

## 最小的适配回归样本

可以用两个用户、两个已加载 Cube 和一个不带模型的伪后端先验证入口路由：记录实际接收到的 Cube 身份和删除参数类型，不需要先承担完整推理成本。随后再换成真实 tree_text 后端，对同一个长 memory_id 调用高层删除，检查数据库收到的是完整 ID 还是若干字符，并确认最终查询已停止返回该节点。这是建议的分层验证方式，本轮没有执行，也没有声称上游测试未覆盖。

删除还应检查关联边、归档节点和由旧记忆形成的合并摘要。硬删一条节点并不自动证明所有派生记忆同步消失；产品需要明确“删除这条内容”与“删除由此得出的全部经验”的范围。保留来源信息正是为了让这类要求能够进一步实现和测试。

## 自测

1. 为什么默认 Cube 搜索隔离通过，仍不足以验证显式 install_cube_ids 路径？
2. memory_id 的字符串如何在未检查类型的后端调用中变成多个删除目标？
