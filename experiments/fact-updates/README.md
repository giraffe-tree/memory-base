---
id: experiments.fact-updates
title: 旧决定改了以后，怎样验证知识与索引一起更新？
summary: 待运行方案：追踪 daily、digest、Dream 水位、检索结果和宿主上下文的分别变化。
project: reme
minutes: 7
status: pending
prerequisites:
- projects.reme.updates-forgetting
- projects.reme.retrieval-context
sources:
- tests/unit/test_dream_checkpoint_versions.py
- reme/steps/evolve/dream/finish.py
- reme/steps/evolve/dream/integrate.py
- reme/steps/index/search.py
---

## 当前状态：方案已写，实验未运行

本轮阅读了 Dream 处理版本测试与相关实现，没有运行模型整合、后台监听或检索端到端实验。本页定义下一轮的合成输入、检查点和失败边界。

重点不是看最终回答是否碰巧说了 Rust，而是分开观察：来源改了、长期知识改了、处理水位推进了、搜索返回新内容、宿主确实把新内容用进模型调用。

## 用一条决定贯穿

第一次 daily：11月3日讨论后，alpha 项目决定先用 Python。第一次 Dream 应形成带来源的 digest。第二次输入：11月4日明确决定改用 Rust，并保留“之前试过 Python”的历史背景。

预期是当前方案与过去经历可以共存；不是把所有含 Python 的历史都删除，也不是继续用一个没有时间条件的“项目采用 Python”指导新任务。

## 分开观察五个位置

| 位置 | 记录什么 |
| --- | --- |
| 来源与 daily | 原话、发生时间、新决定、历史语境与来源链接 |
| digest | 新建还是更正、适用范围、旧结论是否仍被无条件使用 |
| Dream catalog | 本轮读取版本、成功与失败路径、是否推进水位 |
| 检索 | 新旧chunk、来源范围、去重上下文与最终排序 |
| 宿主请求 | 实际收到哪些片段，回答是否遵循当前状态 |

## 两类并发变化

在 Extract 已读取旧文件后阻塞受控 Agent，修改 daily，再放行整合。Finish 应记录扫描时的 mtime，使之后版本仍能被下一轮识别。上游 `test_dream_checkpoint_versions.py` 以受控 Agent 和真实本地存储覆盖相关恢复场景，但读过该测试不等于本轮已执行。

另一种是在来源删除之后继续查询 digest。要分别观察索引删除、catalog 清理和长期知识内容；当前不能预设来源删除会自动撤销 digest 中的每条派生事实。

## 控制比较条件

先以受控 Agent 验证版本和文件流转，再用固定模型检验语义判断。每轮固定日期窗口与配置；查询时使用新 `tool_context_id`，并另做同一上下文重复检索样本，避免把已返回去重误当成索引过时。

默认窗口只有两天，因此还应增加窗口外旧 daily 修改的样本，记录显式扩展扫描范围后能否处理。不能把“默认没有扫描”写成“整合逻辑忽略所有旧修改”。

## 下一步命令与验收

完整依赖准备后，可先在上游目录运行：

```bash
pytest tests/unit/test_dream_checkpoint_versions.py -v
```

本轮未执行这条命令。后续报告要给出每一层的前后状态、受控与真实模型的区分、扫描窗口、失败点和重启结果；最后才评价更新是否正确，以及保证到什么范围。


## 源码定位

- [tests/unit/test_dream_checkpoint_versions.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_dream_checkpoint_versions.py)
- [reme/steps/evolve/dream/finish.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py)
- [reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)

## 自测

1. 如果旧事实仍在历史里，怎样判断它是合理保留还是错误的当前状态？
2. 为什么新建一个 tool_context_id 有助于区分检索去重与内容更新问题？
