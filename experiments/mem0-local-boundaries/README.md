---
id: experiments.mem0-local-boundaries
title: Mem0 的排序与本地历史，实际执行会怎样？
summary: 直接执行两个真实上游模块，17个合成局部样本通过：检索门控、归一化、SQLite事务、scope缓存与重开持久化。
project: mem0
minutes: 8
status: experiment_verified
prerequisites:
- projects.mem0.storage-index
- projects.mem0.retrieval-context
sources:
- mem0/utils/scoring.py
- mem0/memory/storage.py
---

## 结果与执行范围

本轮在macOS、Python 3.11.12、SQLite 3.43.2执行，17/17样本通过。脚本为 `experiments/mem0-local-boundaries/run.py`，完整记录在同目录 `results.json`；源码固定 `ed1f10fc87080f0b67f99be370817504888462ab`。

通过importlib直接加载未经修改的 `scoring.py` 与 `storage.py`，没有复制函数实现，也没有替换被测逻辑。两个模块可用标准库运行，脚本避免导入整个mem0包，不构造Memory／AsyncMemory，也不触发模型、遥测、NLP下载或向量后端初始化。

## 样本说明

| 组别 | 检查 | 观察 |
| --- | --- | --- |
| 归一化 | BM25原始分等于sigmoid中点 | 输出0.5 |
| 参数选择 | 两词与四词预处理查询 | 返回不同midpoint与steepness |
| semantic门控 | 低于0.1候选配高BM25/entity | 仍排除 |
| 候选边界 | 关键词映射有新ID | 不产生新语义候选 |
| 单路分数 | semantic=0.8且无其他信号 | 输出0.8 |
| 三信号 | 0.8+0.6+0.5，分母2.5 | 输出0.76 |
| 排名变化 | 较低semantic叠加高BM25 | 排序改变 |
| 活跃信号分母 | keyword映射存在候选外ID | 原0.8候选变为0.4 |
| 返回数量 | top_k=1 | 只返回一个 |
| 解释与副作用 | explain=True | 分母可见，输入未改写 |
| 历史序列 | ADD／UPDATE／DELETE合成事件 | 三条均保留 |
| 删除历史 | DELETE带old_memory=Rust | 仍可读到Rust且is_deleted为true |
| SQLite事务 | 批量第二条参数类型不支持 | 本批首条也回滚，不残留记录 |
| 消息容量 | 同scope写12条 | 最多保留10条 |
| scope边界 | alpha与beta各写消息 | beta只读自己的消息 |
| 重复缓存 | beta写同文本两次 | 两条都保留 |
| 重开数据库 | 关闭再打开临时文件 | history与最近消息仍可读 |

排序样本使用显式合成信号，未测embedding、BM25后端或spaCy的实际输出。消息容量样本一次保存12条，时间戳相同；只核验数量，不对截止位置的并列消息顺序作保证。

## 失败注入不是项目缺陷

事务样本故意把字典放入SQLite文本参数。上游打印绑定错误并执行ROLLBACK，脚本随后断言整批没有残留记录。这是预期故障输入，用于观察本地事务范围，不是发现了真实业务缺陷。

history事件由样本直接写入，不是执行完整 `Memory.update/delete`。因此可以证明SQLite保存了什么，不能据此证明主向量库、history与实体collection之间的顺序或原子性；后者只能由主链路源码与后续集成实验判断。

## 复现

按仓库 README 的“获取与每日更新源码”说明获取固定Mem0源码，在根目录执行：

```bash
python3 experiments/mem0-local-boundaries/run.py
```

脚本校验HEAD与被加载文件未修改，在临时目录中创建SQLite，运行后清理；任何样本失败都非零退出。重跑会更新环境和时间记录，应检查结果差异。

## 尚未验证

真实模型提取、两次add重复语义、向量／keyword召回质量、实体NLP中文效果、跨store失败恢复、REST行级授权、托管平台内部实现和端到端回答质量均未运行。与ReMe的差异见 [检索对比](../../docs/comparisons/retrieval-context.md)，其源码结论不自动升级为实测。


## 源码定位

- [mem0 · mem0/utils/scoring.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/utils/scoring.py)
- [mem0 · mem0/memory/storage.py](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/storage.py)

## 自测

1. 只有semantic候选进入排序，为什么仍可能受到候选外keyword映射影响分数？
2. 为什么SQLite批量事务回滚通过，仍不能证明整个Memory.add原子提交？
