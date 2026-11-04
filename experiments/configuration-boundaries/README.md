---
id: experiments.configuration-boundaries
title: 配置和文件边界，实际执行会怎样？
summary: 13 个局部样本已通过：检查默认配置、覆盖规则、路径逃逸和允许范围；未启动完整 ReMe。
project: reme
minutes: 7
status: experiment_verified
prerequisites:
- projects.reme.storage-index
- projects.reme.integration-isolation
sources:
- reme/config/config_parser.py
- reme/schema/application_config.py
- reme/steps/file_io/_path.py
---

## 结果与样本

本轮在 macOS、Python 3.11.12、PyYAML 6.0.3、Pydantic 2.11.7 上执行，13/13 样本通过。脚本为 `experiments/configuration-boundaries/run.py`，完整记录为同目录 `results.json`。

实验直接加载固定版本的真实上游函数和公开 schema，未复制其实现，也没有替换被测试函数。为避免包初始化时拉入 AgentScope 等无关后端，脚本只设置对应命名空间的模块搜索路径，并导出真实 logger 函数。所有文件边界样本在临时目录中运行，结束后删除临时目录。

这是**局部实验验证**：没有启动 HTTP、MCP、文件监听、记忆 Agent 或模型，也没有安装完整 ReMe 的依赖集合。当前 Pydantic 低于该 commit 声明的最低版本，因而这些 helper 的通过不能解释成完整受支持环境的兼容性证明。

## 观察到了什么

| 检查 | 实际结果 |
| --- | --- |
| 默认关键词索引与向量连接 | `bm25`，`embedding_store` 为空字符串 |
| 默认 Dream 扫描与单元数 | `scan_days=2`，`max_units=5` |
| 仅关闭 Dream 定时任务 | dream_cron 禁用；auto_dream 与 optimize_index_cron 保留启用 |
| 前导零 ID | `session_id=007` 解析后仍是字符串 |
| 嵌套参数与标量冲突 | 拒绝覆盖，抛出 ValueError |
| 未定义环境变量 | 明确抛错，不静默替换为空 |
| 绝对 session_dir | schema 拒绝，要求工作区相对路径 |
| 普通相对文件 | 解析为规范化后的工作区内绝对路径 |
| `..` 越界与软链接逃逸 | 两个样本均被拒绝 |
| 空允许路径列表 | 拒绝访问，fail closed |
| 路径前缀同名碰撞 | 允许 daily 不会允许 daily-other |
| 允许目录的子文件 | 通过权限判断 |

首次运行时，“普通相对文件”用未规范化的 macOS `/var` 路径作预期，与实现返回的 `/private/var` 不一致。修正实验的路径规范化假设后重新执行全部13例通过；没有修改上游实现。这个过程提醒我们：断言也需要和契约对齐，不能把样本失败直接写成项目缺陷。

## 复现

从仓库根执行，先按仓库 README 的“获取与每日更新源码”说明获取固定源码。Python 环境需要 PyYAML 与 Pydantic；实际使用的版本写在结果记录中。

```bash
python3 experiments/configuration-boundaries/run.py
```

脚本先核对上游 HEAD，再运行所有样本，写入 `results.json`；有任何失败则非零退出。复跑会更新记录时间和环境，应评审差异后再保存研究结果。

## 没有证明什么

这些结果不能证明 AutoMemory 的语义质量、索引更新可见时延、服务级租户鉴权、跨进程并发安全或模型回答正确。它们分别验证配置解析和指定路径 helper 的局部行为；其他 Job 是否都接入相同检查，仍需逐入口核验。


## 源码定位

- [reme/config/config_parser.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/config_parser.py)
- [reme/schema/application_config.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/schema/application_config.py)
- [reme/steps/file_io/_path.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/_path.py)

## 自测

1. 允许范围校验通过，为什么不能推导调用者身份已经验证？
2. 为什么13个局部样本通过，仍不等于启动完整 ReMe 会成功？
