---
id: experiments.letta-memory-constraints
title: MemFS 的目录、元数据与预算约束，实际怎样判断？
summary: 三个真实TypeScript辅助模块、20个合成样本通过；只验证格式与树约束，不构造Letta或执行Cloud／Git投影。
project: letta
minutes: 8
status: experiment_verified
prerequisites:
- projects.letta.memory-model
- projects.letta.storage-index
sources:
- src/memory-frontmatter.ts
- src/memory-constraints.ts
- src/agent/memory-format.ts
---

## 结果与加载方式

本轮在Node 22.23.4、TypeScript 5.9.3、macOS上运行，20/20合成样本通过。输入与执行器为 `experiments/letta-memory-constraints/run.mjs`，完整记录保存在同目录results.json；固定源码为e6d6cc27ef1111da80e919dc1cef179613894b66。

脚本直接读取三个未修改的TypeScript源文件，用当前项目TypeScript编译器转成临时CommonJS模块。只做类型擦除和模块格式转换，不替换被测函数。使用合成内存文件树，不安装Letta依赖，不读取真实Agent记忆，不启动模型、服务、Git hook或Cloud。

## 观察到什么

| 样本组 | 观察 | 实际代码证据 |
| --- | --- | --- |
| v2索引 | 根／子MEMORY.md不能有frontmatter，纯索引可通过 | [validateMemoryFileFrontmatter](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-frontmatter.ts) |
| v2普通文件 | 要求name／description；缺字段、重复字段与空引号名被拒 | [validateMemoryFileFrontmatter](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-frontmatter.ts) |
| legacy保护 | 依据previousContent的read_only拒绝修改，不相信新内容自报 | [legacyValue](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-frontmatter.ts) |
| core分类 | 根project.md是core，projects/alpha.md不是core | [isCoreMemoryPath](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) |
| 投影资格 | 祖先目录缺索引不投影，有索引可投影；skills排除 | [isProjectedMemoryPath](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts) |
| 树结构 | 要求根MEMORY.md和嵌套目录索引 | [validateMemoryTreeConstraints](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-constraints.ts) |
| 字符预算 | 😀中按2个Unicode码点，😀中文按3个；core有合计限制 | [字符计数循环](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-constraints.ts) |
| 可信保护树 | readOnlyFiles必须提供acceptedTree；内容改动被拒绝 | [readOnlyFiles处理](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-constraints.ts) |
| 配置路径 | ../越界glob被配置解析拒绝 | [parseMemoryConstraintsConfig](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-constraints.ts) |

以上九组共20个样本，逐条结果保存在JSON中。路径“可投影”只表示该helper的分类判断，不表示实际内容已经提交或进入模型请求。

## 复现

在仓库根目录准备锁定Node依赖，并按研究基线获取letta-code：

```bash
npm ci
npm run sources:prepare
node experiments/letta-memory-constraints/run.mjs
```

脚本检查HEAD与三个源文件没有偏离固定版本，创建临时目录转译、加载、执行，最后清理临时目录。有失败会非零退出，重跑会更新结果时间和环境。

## 不能推出的结论

没有执行完整Letta、主Agent工具、真实Git提交／hook／worktree锁、prompt编译、消息BM25、reflection或AppServer鉴权。20个helper样本通过不能证明多进程一致性、Cloud效果或完整Node发行包已通过验收。

这页是局部实验验证；三方文章中引用它时只支持相同helper与输入范围，不把格式约束扩写成事实语义正确。


## 源码定位

- [letta · src/memory-frontmatter.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-frontmatter.ts)
- [letta · src/memory-constraints.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/memory-constraints.ts)
- [letta · src/agent/memory-format.ts](https://github.com/letta-ai/letta-code/blob/e6d6cc27ef1111da80e919dc1cef179613894b66/src/agent/memory-format.ts)

## 自测

1. 文件满足元数据和目录限制，为什么仍不能证明它已经进入system prompt？
2. 字符预算按Unicode码点计数，为什么不等于provider模型的token预算？
