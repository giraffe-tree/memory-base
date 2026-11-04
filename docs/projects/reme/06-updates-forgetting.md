---
id: projects.reme.updates-forgetting
title: 新事实怎样修正旧记忆，删除又会传播到哪里？
summary: Dream 用带来源的知识单元更新 digest，处理水位控制重试；删除文件不等于撤销所有派生事实。
project: reme
minutes: 9
status: source_verified
prerequisites: [projects.reme.write-path, projects.reme.storage-index]
sources: [reme/steps/evolve/dream/extract.py, reme/steps/evolve/dream/integrate.py, reme/steps/evolve/dream/integrate.yaml, reme/steps/evolve/dream/finish.py, reme/steps/file_io/delete.py, tests/unit/test_auto_dream.py]
---

## 结论：整理是有来源的再解释

本页核验基线为 `d323356e6f11`。Dream 不是把 daily 原文复制到另一个目录，而是先提取可复用知识单元，再让整合 Agent 检索已有 digest，决定创建、佐证、细化或纠正。这个选择包含模型判断；程序验证回执、文件目标及处理状态，并没有替所有自然语言事实建立数据库约束。

因此，“运行成功”表示这次流程符合当前程序契约，不代表语义冲突已经全部消除。文件删除、检索索引删除和知识撤销是三个需要分别检查的动作。

## 沿一次项目变更看更新

假设周一记录“项目决定使用 Python”，周三记录“新决定改用 Rust”。输入先成为来源笔记。`DreamExtractStep.execute` 刷新近期日目录，比较文件修改时间与 dream catalog 中的水位，把变化的材料交给模型，得到带 `paths` 的知识单元。

`DreamIntegrateStep` 给整合 Agent 开放 `node_search`、`read`、文件编辑等工具。提示词要求先跨 digest 分类召回，再检查候选：同一抽象作为更新目标，相关知识以正文 wikilink 连接。动作分为 `CREATE`、`CORROBORATE`、`REFINE`、`CORRECT`。本例应让新决定成为适用的当前信息，并保留它与旧材料的关系；这属于期望语义，需要实验检查模型实际如何写。

提示词要求保留已有来源链接，并在纠正时补充说明。这里的“纠正”主要表现为对 Markdown 的编辑，不是具有生效区间、排他性和自动查询约束的事实表。不能假定所有读取者都会自动识别“已过时”。

## 水位决定哪些材料还会再处理

`DreamFinishStep.execute` 只为已处理且不在失败来源集合中的变化路径写入 catalog。因全局知识单元预算耗尽而未送给模型的材料进入 `deferred_paths`，其对应日索引也不能提前确认。保存的是扫描时观察到的修改时间；处理期间发生的新编辑仍应在下轮表现为变化。

如果一个来源同时参与成功单元和失败单元，它仍然属于失败来源，不能因为部分成功就提前推进水位。上游 `test_integrate_failure_only_blocks_affected_sources` 明确检查这个边界。这是重试资格管理，不是跨多个 digest 文件的原子事务。

整合阶段在同一个 Application 内持有一把整合锁，逐个处理单元。若模型调用失败或回执无效，但恰好检测到一个符合目标约束的文件发生变化，程序可从文件副作用恢复结果；否则最多再试一次，并保留失败来源。变化检测使用 `mtime_ns + size`，源码明确把它视为低成本、尽力而为的信号，而非内容级事务日志。

## 删除边界：报告引用，不自动抹去知识

`DeleteStep` 先解析 workspace 内路径、查找入链，再删除文件或目录，返回仍存活的引用信息。它不会逐条解释其他笔记的自然语言，也不会把“来源已删”自动变成“这个事实为假”。

Dream 扫描会移除扫描范围内已删除来源的 catalog 条目；这清理的是处理水位。它并未实现从来源到每一个派生断言的全面级联撤销。若删除周一笔记，周三 digest 中引用周一的句子仍需单独检查。检索索引的删除传播又由文件监听与索引更新链负责。

默认只扫描最近两天，所以更早文件的更正也不能直接等同于下一次定时 Dream 会处理。手动扩大扫描范围后，仍需检查它是否正确识别、整合并供给了新事实。

## 源码定位

- [提取与变化扫描：DreamExtractStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/extract.py)
- [整合、锁与副作用恢复：DreamIntegrateStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [更新动作的提示词契约](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.yaml)
- [处理水位：DreamFinishStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py)
- [文件删除：DeleteStep](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/delete.py)
- [失败、水位及分批边界的单元测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_auto_dream.py)

本页为源码核验，未运行真实模型整合或删除传播实验。

## 自测

1. 为什么删掉来源文件，不能证明模型下次不会再看到它派生的事实？
2. 一条材料被成功单元和失败单元共同引用时，为什么必须保留重试资格？
