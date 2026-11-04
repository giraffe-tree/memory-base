---
id: foundations.start.context
title: 模型这一次究竟能看到什么？
summary: 上下文是本次调用实际收到的材料，保存的历史不自动等于可见输入。
project: reme
minutes: 4
status: source_verified
prerequisites:
- foundations.start.agent
sources:
- reme/components/agent_wrapper/as_agent_wrapper.py
- reme/steps/compaction/compact_context.py
---

## 先区分三个位置

信息可能在磁盘上、在宿主维护的会话状态中、在本次模型请求中。这三个集合不相等。一个系统保存了完整历史，并不表示下一次调用会把所有内容都发送给模型。

上下文是这一次调用的输入材料，包括指令、选中的消息、工具结果、注入的记忆。模型能否使用一条保存过的信息，要沿着读取、选择、拼接和发送这条链路检查。

## “记得”是怎么发生的

第一段对话里你决定暂用 SQLite。第二段对话开始时，如果宿主只发送“帮我设计数据库表”，模型缺少此前决定。宿主可以主动读取项目记忆，也可以先让 Agent 搜索，再把工具返回内容加入后续请求。真正改变本次输入的是这一步供给。

因此，评测应该分别检查保存结果、检索结果、请求上下文和最终回答。只看到正确回答，也不能排除模型靠常识猜中。

## 压缩与长期记忆不同

当前 `CompactContextStep` 接收消息，识别工具调用和结果对，为低相关结果提出可恢复的预览；它不直接改写原始来源历史。若设置输出 token 预算，要求宿主注入 `token_counter(messages)`。当材料都受保护或没有可缩减内容时，预算可能仍不满足。

这是控制眼前材料的机制。把一次经历提炼成 daily、再整理成 digest，则是在维护可复用的外部知识。两者可以协作，但不是同一个状态。

## 边界

某些平台替你管理历史，不等于新请求总是没有历史；也不等于平台保证保留所有历史。这里研究的是具体输入装配，而不是依靠聊天界面的直觉判断。


## 源码定位

- [reme/components/agent_wrapper/as_agent_wrapper.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/agent_wrapper/as_agent_wrapper.py)
- [reme/steps/compaction/compact_context.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/compaction/compact_context.py)

## 自测

1. 文件保存成功后，模型仍然不知道它，可能缺了哪几步？
2. 为什么一个上下文压缩功能不能自动证明系统具有长期记忆？
