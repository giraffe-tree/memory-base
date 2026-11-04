---
id: projects.reme.runtime-consistency
title: 请求、后台任务和定时整理如何共享状态？
summary: Application 管生命周期，RuntimeContext 管单次执行；监听和处理水位让文件与派生状态逐步收敛。
project: reme
minutes: 9
status: source_verified
prerequisites: [projects.reme.overview, projects.reme.storage-index]
sources: [reme/application.py, reme/components/job/base_job.py, reme/components/job/background_job.py, reme/components/job/cron_job.py, reme/components/job/stream_job.py, reme/components/runtime_context.py, reme/config/default.yaml, tests/unit/test_job.py]
---

## 结论：生命周期集中，执行状态分层

ReMe 把组件、Job 和服务放进一个 Application 生命周期；单次请求则拥有自己的 RuntimeContext。文件写入、文件变化被监听到、索引处理完成，是不同事件。当前实现包含锁、重试和恢复机制，但不能把它们概括成整个系统具有一个跨文件、跨索引的事务。

本页基于 `d323356e6f11` 的实现与上游单元测试阅读，未执行并发服务压测。

## 先确定状态属于谁

| 状态 | 持有者 | 重启后的含义 |
| --- | --- | --- |
| 输入、步骤中间结果、Response | 单次 RuntimeContext | 请求结束后不承担持久化职责 |
| Step 配置与依赖引用 | 本次构建的 Step 实例 | 下次调用重新构建 |
| 计数器、整合锁及共享辅助状态 | ApplicationContext.metadata | 随该 Application 生命周期存在 |
| 记忆文件、处理水位、索引持久化数据 | workspace 与对应组件 | 是否可恢复取决于具体保存和加载路径 |

`BaseJob._build_steps` 每次调用创建新 Step，所有顺序步骤共享同一 RuntimeContext。调用参数覆盖 Job 默认参数。这使一次 Dream 可以把提取状态交给整合和 Finish，而不必通过一个全局临时变量传递。

## 启动顺序不是随意的

`Application._start` 先按依赖拓扑启动组件，然后依次启动普通 Job、流式 Job、后台 Job、Cron Job。必需依赖缺失或出现环会失败；已经启动的资源在失败时关闭。正常退出按启动顺序反向关闭，最后释放可选线程池。

假设索引监听在 file store 之前运行，第一次事件就可能访问尚未初始化的组件。拓扑排序解决组件准备顺序，Job 分层保证后台任务开始前普通工具入口已经准备；它不保证外部客户端发来请求时，所有历史文件都已完成首次索引。

## 三种执行方式有不同错误契约

`BaseJob` 捕获步骤异常，保留异常链描述，并把 Response 标为失败。它不会自动回滚之前已完成的步骤。即使某一步只修改了 `response.success`，顺序循环也不会仅因为该字段为 false 就自动停止，后续步骤仍需按状态判断。

`StreamJob` 把异常变成 ERROR chunk，然后发送 DONE，方便消费者脱离流。流结束说明协议生命周期结束，不代表业务成功。

`BackgroundJob` 则让异常传到 supervisor：默认指数退避重启，附带抖动并限制最大等待。关闭时先设置 stop event，等待默认五秒，超时再取消任务。线程池模式与普通事件循环模式的停止事件类型不同。这里的重启针对后台协程，不是消息队列的持久化投递保证。

`CronJob` 根据配置时区计算下一次触发，逐次执行步骤并记录错误。默认 Dream 在 23:00、索引优化在 02:00 触发；这来自当前默认配置，可以被覆盖。进程关闭期间的每个错过触发点是否需要补跑，应由应用明确安排，不能从 cron 表达式推导出可靠补偿。

## 一次写入后，为什么搜索可能稍晚？

默认 `index_update_loop` 先扫描差异，再监听 daily 与 digest 的 Markdown 变化，派发索引更新；资源导入还有独立监听链。直接写文件与派生索引更新之间因此存在处理窗口。

例如写入项目决定后马上发起搜索，不能仅凭文件已经存在就断言索引已包含新分块。验收应分别观察文件内容、监听处理结果和搜索返回。启动扫描有助于补齐停机期间的文件变化，但可重建并不表示恢复过程没有失败，也不意味着所有处理水位可以随意删除。

## 源码定位

- [启动拓扑与逆序关闭：Application._start / _close_started_components](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)
- [步骤实例与普通异常契约：BaseJob](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/job/base_job.py)
- [后台监督与停止：BackgroundJob](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/job/background_job.py)
- [时区与触发：CronJob](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/job/cron_job.py)
- [请求作用域：RuntimeContext](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/runtime_context.py)
- [默认监听与调度配置](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)
- [监督重启、时区与启动失败测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_job.py)

## 自测

1. Step 实例、RuntimeContext 和 ApplicationContext 各能保存多久的状态？
2. “后台任务会重启”为什么不能替代业务幂等和持久化队列？
