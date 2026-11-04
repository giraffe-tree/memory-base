---
id: foundations.start.memory
title: 记忆系统除了保存，还要完成什么？
summary: 记忆需要保存、组织、找回与更正，并保留事实的来源、时间和作用域。
project: reme
minutes: 4
status: source_verified
prerequisites:
- foundations.start.context
sources:
- reme/steps/evolve/auto_memory.yaml
- reme/steps/evolve/dream/integrate.py
- reme/steps/index/search.py
---

## 让协作能够持续

一周的项目讨论可能包含备选方案、正式决定、失败实验和待办。简单追加所有消息能够保留历史，却不能直接告诉下一次任务“现在采用哪个方案”。记忆系统需要把经历组织成可查找、可解释、能够更正的材料。

在这个手册中，外部记忆指应用在模型参数之外保存和使用的数据。它不会因为被写入某个文件，就自动训练进模型；仍需要合适的检索与供给路径。

## 三种容易混淆的内容

“周一讨论过 Rust”是历史事件；“当前选择 Rust”是项目状态；“CLI 项目如何评估语言”可能是可复用方法。三句话可以同时成立，但更新时间和适用范围不同。

如果周三改回 Python，旧事件不应被改成“周一没讨论 Rust”；当前状态却需要更新。整理必须同时保留时间线与可用结论，不能只凭最后一条文本粗暴覆盖所有历史。

## ReMe 的对应位置

AutoMemory 提示词要求记录持久事实、叙事决定、当前状态与可复用步骤。它通过 Agent 工具把内容写成 daily。Dream 再从经历中提炼长期知识，并结合已有 digest 决定新增、补充、细化或更正。检索把相关材料带回未来任务。

这些是源码中存在的组织机制。具体事实是否被正确识别、临时需求是否被误记成偏好，仍取决于输入、模型和实际运行结果，需要案例验证。

## 边界

记忆的数量不等于质量；检索分数也不是事实正确率。来源缺失、过时决定和作用域错配，都可能让“检索成功”变成协作错误。


## 源码定位

- [reme/steps/evolve/auto_memory.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/auto_memory.yaml)
- [reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [reme/steps/index/search.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/index/search.py)

## 自测

1. “这次请详细讲”为什么不应直接覆盖“平时偏好简洁”？
2. 一条新决定出现后，历史事件与当前状态应分别怎样处理？
