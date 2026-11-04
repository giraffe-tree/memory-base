---
id: section.project.topic
title: 一个能讲清楚的问题
summary: 一句话说明结论与适用条件。
project: reme
minutes: 6
status: pending
prerequisites: []
sources: []
---

## 先说结论

标明源码核验、实验验证、官方说明或推断；不要把整个页面的标签当作每句结论的证明。

## 用一个例子追踪

区分输入、模型判断、程序动作、持久化状态与用户可观察结果。

## 机制与状态归属

从真实入口到关键符号，写清进程内调用、HTTP 与 MCP 的不同边界。

## 边界与未验证范围

写清默认配置、可选能力、失败条件、样本和未运行检查。

## 源码定位

使用 sources/revisions.yaml 中固定的 commit 链接，列出符号与支持的结论。

## 自测

1. 用自己的话追踪一次状态变化。
2. 哪个条件改变会让结论失效？
