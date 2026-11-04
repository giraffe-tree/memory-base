---
id: projects.letta.cost-adoption
title: 持久记忆会把成本放在哪里，什么情况下适合采用？
summary: root 常驻、deferred 按需读取、反思与 Git 同步带来不同成本；Cloud 配额和本地 BYOK 必须分开测量。
project: letta
minutes: 9
status: source_verified
prerequisites: [projects.letta.retrieval-context, projects.letta.evaluation-observability]
sources: [src/agent/memory-format.ts, src/tools/impl/memory.ts, src/agent/system-prompt-size.ts, src/cli/helpers/memory-reminder.ts, src/cli/helpers/post-turn-reflection.ts, src/agent/memory-worktree.ts, src/cli/subcommands/usage.ts, src/backend/api/metadata.ts, src/backend/local/local-backend.ts, src/websocket/app-server-auth.ts]
---

## 结论：这是 Agent 系统的全链路成本

当前 Letta Code 让 core memory 参与持续上下文，deferred 内容通过工具按需发现，反思可由客户端或 Cloud 承担。成本因此包括普通任务模型输入、工具与多轮读取、后台整理、上下文压缩、Git/文件操作以及部署资源。

本页只根据 `e6d6cc27ef11` 的实现分析成本结构，没有访问账号余额、调用真实模型或测量收益。不提供未验证的金额、延迟和节省百分比。

## 先拆常驻与按需部分

`detectMemoryFormat` 由 root `MEMORY.md` 是否存在判断 v2；v2 的 root Markdown 是 core，子目录为渐进发现。Memory 工具返回某个目录索引和直接子项，必要时再读取具体文件。它降低一次性塞入所有内容的需求，但可能增加工具往返和模型轮次。

把稳定的短期背景全部留在 root，会让之后许多模型请求反复携带它；把必要条件藏得太深，则可能让 Agent 查找失败或多走几轮。不能只按磁盘记忆总字数估计上下文费用，要记录每次实际进入请求的内容。

`estimateSystemTokens` 按字节数除以四估算，CLI 可列出占用较多的 core 文件。这是整理布局的反馈工具，不是统一计费器。不同语言、模型和缓存规则会让实际 token 与费用发生变化。

## 反思不属于零成本维护

客户端反思默认设置以 compaction-event 触发，可配置 step-count 或 off；stepCount 默认值是二十五，但默认触发方式并不是每二十五步一定运行。触发还受 MemFS、已有任务、平台和 Cloud cutover 等条件限制。

反思会准备转录与父记忆快照、创建子任务及 worktree、调用模型整理并尝试整合。失败或父仓库不适合合并时，可能保留重试资格；这些尝试也有模型与本地 I/O 成本。Cloud `/dream` 则只提供 admission 回执，客户端不能从排队结果推导服务端本次消耗了几次模型请求。

所以比较“有记忆”与“无记忆”任务时，要把先前采集、反思与失败尝试摊入同一观察周期，而不只比较最后一条回答的 prompt 长度。

## Git 同步和运行资源也需要测量

| 环节 | 应观察的成本 | 与用户体验的联系 |
| --- | --- | --- |
| root 记忆编译 | 文件读取、Git HEAD 解析、模型输入与缓存 | 新状态何时进入下一轮 |
| deferred 查找 | 目录遍历、工具返回、模型往返 | 能否找到细节，是否被截断 |
| 反思和整合 | 子任务 token、工作树与冲突重试 | 长期知识是否改善而非越积越乱 |
| clone/pull/push | 网络、仓库体积、认证与冲突 | 其他设备何时看到新版本 |
| 本地运行时 | 转录、manifest、编译缓存、模型适配与进程内存 | 恢复速度、长期运行稳定性 |

同步返回超时后仍继续进行，不能把客户端等待时长直接当作远端实际耗时。Git 历史还会保存旧版本，删除当前文件也不直接降低所有历史与备份体积。

## Cloud 额度与 local BYOK 分开

`letta usage` 在 API 模式读取计划、credit balance 与模型 quota 元数据；在 local backend 下只提示模型使用需要 BYOK。local backend 的推理与 MemFS 可以由本进程组织，但 provider 可能仍在网络另一端，凭据和费用归使用者配置。

账户 quota 页面不是单次记忆任务的完整账单。要比较成本，应保存 provider、模型、输入输出和缓存 usage，并记录是否启用了反思、压缩、重试与额外工具。没有看到账单字段不能解释为零消耗，使用 Cloud 也不能推断所有模型采用同一计费规则。

## 第一版采用条件

如果希望围绕一个持续存在的 Agent 工作，接受文件知识、Git 版本、core/deferred 布局与宿主生命周期共同演化，Letta Code 值得用合成项目做完整试验。优先检验 commit 与模型供给是否一致、反思是否改善知识、失败同步能否被发现。

如果只需要现有后端里的轻量事实提取函数，它的完整宿主与协议成本需要单独评估。若要求不互信租户共用网络入口、彻底遗忘、跨设备强一致或离线覆盖 Cloud Dream 等能力，也不能从当前客户端代码直接承诺满足；需明确权限、服务端边界和部署条件再验收。

## 源码定位

- [v1/v2 与 core/deferred 判定](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) · [Memory 按需读取与截断](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/tools/impl/memory.ts)。
- [core token 粗估](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/system-prompt-size.ts)。
- [反思默认设置](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/helpers/memory-reminder.ts) · [回合后触发判断](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/helpers/post-turn-reflection.ts)。
- [Cloud usage 与 local 提示](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/cli/subcommands/usage.ts) · [余额和配额 API](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/backend/api/metadata.ts)。

## 自测

1. deferred 比 root 更省输入，为什么仍可能提高某些任务的总体成本？
2. Cloud 余额、本地 BYOK 与反思后台开销应怎样放入同一成本实验？
