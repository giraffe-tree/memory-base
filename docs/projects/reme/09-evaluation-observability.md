---
id: projects.reme.evaluation-observability
title: 怎样判断记忆真的有用，而不只是任务执行成功？
summary: 单元测试、组件健康、检索命中和最终回答质量回答不同问题，评测必须保存完整条件。
project: reme
minutes: 8
status: source_verified
prerequisites: [projects.reme.retrieval-context, projects.reme.runtime-consistency]
sources: [reme/steps/common/health_check.py, reme/steps/common/status.py, reme/utils/counter.py, reme/utils/logger_utils.py, benchmark/longmemeval/run.py, benchmark/longmemeval/config.yaml, tests/unit/test_auto_dream.py, tests/unit/test_status_step.py]
---

## 结论：先把四种“成功”拆开

一条请求没有抛异常，记忆文件正确，搜索找回了相关证据，模型最终作答正确，是四个不同结果。ReMe 提供执行状态、组件快照、日志、计数器和多个 benchmark 入口；它们构成观察工具，不能彼此替代。

本页核验 `d323356e6f11` 的测试和评测代码，没有执行完整 benchmark，也没有任何本项目测得的准确率、延迟或节省比例。

## 从一条错误回答倒查

假设用户已经改用 Rust，回答仍建议 Python。先检查新消息是否进入来源文件，daily 是否准确记录“决定变更”；再检查 Dream 是否扫描到它、是否因预算被延后、是否成功改写 digest；然后查搜索的 query、返回片段与日期；最后看宿主实际发送给模型的上下文。

若返回正确片段但宿主丢弃，属于供给链故障；若上下文正确而回答错误，才继续分析回答阶段。若 digest 把试探想法写成既成决定，增加搜索召回可能只会更稳定地返回错误信息。评测应保留中间材料，不能只存一个最终分数。

## 源码现有的观察点

`HealthCheckStep` 汇总 embedding store、file graph、file store 和 keyword index 的启动状态与若干计数。健康判断主要检查是否启动，embedding 还考虑健康字段。它没有通过真实问题验证语义正确性，也不自动探测所有模型服务和业务步骤。

`StatusStep` 估计所跟踪组件的 Python 对象大小，并另报进程 RSS。组件独立计量可能重复计入共享的非组件对象；对象估计总和不是唯一物理内存，也不等于磁盘记忆大小。把这份状态页叫“容量与进程观察”更准确。

`BaseJob` 的调用计数记录在 Application metadata 的树形计数器中，`counter.py` 使用锁保护更新和快照。它是应用存活期间的累计值，不是持久审计账本。Dream 的 Response metadata 还能描述扫描、变化、延后、失败和 checkpoint 路径，用来解释为什么某些材料没有进入下轮。

日志工具支持 loguru 或标准 logging，包含源码位置、时间与等级，可配置控制台和文件输出。这提供了排查入口；一次请求跨宿主、MCP、Job 与模型服务的完整关联仍需检查实际日志与调用 ID 是否贯通，不能从“有日志”推断已有统一分布式追踪。

## LongMemEval 到底测了什么

当前 runner 为每个条目准备独立 workspace，按时间顺序导入会话，在跨越设定时间点时触发 Dream，再通过 Agent 查询并由 LLM judge 判断答案。配置允许只复用已有 workspace 做查询与判分，也允许限制题目范围和会话数。

默认配置里有 `filter_future_sessions: true`，意图避免题目日期之后的材料进入记忆。完整解释结果时，还应记录实际使用的数据文件、起止条目、模型、judge、插件、Dream 参数、是否压缩与是否复用旧 workspace。默认 `num_items: 500` 是计划取样数量，不是本研究已经跑过五百条的证据。

这类评测把写入、整理、召回、回答与 judge 结合起来，适合观察整条链的效果；要定位具体改进来自何处，还需在相同输入下分别测记忆内容、召回与回答。没有记忆的基线、相同 token 预算和同一模型也应同时记录。

## 源码定位

- [组件健康快照：HealthCheckStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/common/health_check.py)
- [内存估计与 RSS：StatusStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/common/status.py)
- [应用计数器](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/utils/counter.py)
- [日志后端与文件输出](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/utils/logger_utils.py)
- [LongMemEval 执行流程](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/benchmark/longmemeval/run.py) · [对应配置](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/benchmark/longmemeval/config.yaml)

## 自测

1. 健康检查全绿，但回答仍错，下一步该检查哪些中间证据？
2. 为什么更换 judge、复用旧 workspace 或允许未来材料，都会影响分数解释？
