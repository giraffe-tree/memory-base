# Memory Base

一套面向工程师的 Agent Memory 架构研究手册。从一段经历如何被保存开始，追踪记忆的组织、检索、更新与使用，再用同一组问题比较不同实现。

目标是能沿源码讲清楚：**谁决定记什么，数据由谁持有，何时能被找回，发生冲突后如何更正，以及这些记忆怎样影响下一次模型调用。**

> 已完成ReMe、Mem0与当前Letta Code三个固定版本的源码主线，保留四篇双项目比较并新增四篇三方比较，共53个知识点：48篇源码核验、3篇局部实验验证、2篇待运行方案。没有三套系统同环境的真实模型端到端评测结论。

## 打开学习手册

**在线阅读：[https://giraffe-tree.github.io/memory-base/](https://giraffe-tree.github.io/memory-base/)**

网页由 GitHub Pages 托管，打开即可阅读，无需安装开发环境。本地运行：

在仓库根目录使用 Node.js 22（`.nvmrc` 固定到 22.23.4）：

```bash
nvm use
npm ci
npm run dev
```

打开 [Memory Base 本地学习手册](http://127.0.0.1:8770/#/overview)，也可直接阅读 [认识 ReMe](http://127.0.0.1:8770/#/lesson/foundations.start.reme)、[Mem0 系统边界](http://127.0.0.1:8770/#/lesson/projects.mem0.overview)、[Letta研究](http://127.0.0.1:8770/#/lesson/projects.letta.overview) 或 [三方架构对照](http://127.0.0.1:8770/#/lesson/comparisons.three-way-architecture)。默认端口为 8770，避免占用参考手册的 8769。

网页提供分组目录、项目与全文搜索组合筛选、前后篇、源码来源、章节索引、折叠自测、按项目区分的交互链路图和本机学习进度。比较页按声明展示两个或三个项目各自的固定版本与来源。可以直接在目录、正文顶部／底部或学习记录弹窗勾选“已知道”，无需先打开每篇文章；标记可撤销，阅读不会自动完成课程。数据使用localStorage保存在当前浏览器的当前站点，刷新后保留，同源标签同步；沿用原v1记录，不上传服务器。清除网站数据后记录会丢失；存储不可用或旧数据损坏时页面会明确提示，不冒充已经保存。

## 研究基线与验证范围

- ReMe 源码位于 `refernece/ReMe/`，固定 commit 为 `d323356e6f11c0faf4bf30fae7a2edc30e18fbb9`。
- Mem0 源码位于 `refernece/mem0/`，固定 commit 为 `ed1f10fc87080f0b67f99be370817504888462ab`。主要研究 Python OSS；HostedClient、REST与TypeScript表面分别标明可见范围。研究核验日期为2026-11-04。
- Letta当前源码位于 `refernece/letta-code/`，固定commit `e6d6cc27ef1111da80e919dc1cef179613894b66`。原 `letta-ai/letta` 已变为入口页，指向当前letta-code；本研究不使用旧V1 archive作为现状。LocalBackend实现与Cloud API可见边界分别说明。
- 本地上游为独立 Git 工作副本，主仓库忽略该目录。首次获取按下方“获取与每日更新源码”操作；上游没有研究性修改。
- 已覆盖基础入口10页、项目研究30页、横向比较8页、实验5页。目录和基线分别见 [catalog.yaml](curriculum/catalog.yaml) 与 [revisions.yaml](sources/revisions.yaml)。
- 配置与路径 helper 的 13 个局部样本实际通过，使用合成输入和临时工作区；没有启动完整 ReMe、模型或服务。当前 Python 实验环境与上游完整依赖声明不同，具体版本与局限见 [实验页](experiments/configuration-boundaries/README.md)。
- Mem0排序与SQLite真实模块的17个合成局部样本通过，未构造Memory或启动模型／向量服务，见 [Mem0局部实验](experiments/mem0-local-boundaries/README.md)。
- Letta三个真实TS辅助模块转译后执行20个合成样本通过，只核验MemFS格式、路径分类与树约束，没有构造Agent或运行Git／Cloud／模型，见 [Letta局部实验](experiments/letta-memory-constraints/README.md)。
- 重复写入与事实更新已有实验方案，状态为“待验证”；读过上游测试不算本轮运行通过。没有测得 token 收益、回答质量或部署延迟。

常用检查（严格内容检查需要先获取三个固定版本的上游源码）：

```bash
npm run check
npm test
npm run build
python3 experiments/configuration-boundaries/run.py
python3 experiments/mem0-local-boundaries/run.py
node experiments/letta-memory-constraints/run.mjs
```

检查命令核对文章ID、目录、先修、各项目Git HEAD、源码文件、正文固定版本链接、元数据、TypeScript和静态构建；npm test验证学习记录兼容、异常、同步及证据链接负例。ReMe局部实验需PyYAML、Pydantic；Mem0局部实验只用Python标准库。三组实验的环境、加载方式与结果分别保存在各自目录，局部通过不代表完整依赖安装兼容性。构建产物为 `dist/`，由 GitHub Pages 托管。

## GitHub Pages 发布

推送到 `main` 后，[Pages 工作流](.github/workflows/pages.yml) 自动安装锁定依赖、根据 `sources/revisions.yaml` 临时获取三个固定版本的上游源码、执行学习状态与证据链接测试、内容与 TypeScript 校验，并以 `/memory-base/` 为路径构建和发布 `dist/`。也可以在仓库 Actions 中手动触发。

`refernece/` 仍不提交、不推送，也不包含在发布产物中。CI 获取源码只用于校验版本和文件路径，不安装或执行上游项目。日常拉取最新代码与更新文档的研究基线分别管理。

新机器在 `npm ci` 后可以运行 `npm run sources:prepare` 准备研究源码；已有目录版本不符或包含修改时，该命令会失败并保留现场。

## 获取与每日更新源码

`refernece/` 整个目录不提交、不推送。首次在新机器获取研究基线：

```bash
git clone https://github.com/agentscope-ai/ReMe.git refernece/ReMe
git -C refernece/ReMe checkout --detach d323356e6f11c0faf4bf30fae7a2edc30e18fbb9
git clone https://github.com/mem0ai/mem0.git refernece/mem0
git -C refernece/mem0 checkout --detach ed1f10fc87080f0b67f99be370817504888462ab
git clone https://github.com/letta-ai/letta-code.git refernece/letta-code
git -C refernece/letta-code checkout --detach e6d6cc27ef1111da80e919dc1cef179613894b66
```

日常获取新代码使用：

```bash
python3 scripts/update-references.py
```

脚本对ReMe、Mem0与Letta Code获取最新main，并在 `refernece/latest/ReMe/`、`refernece/latest/mem0/`、`refernece/latest/letta-code/` 创建或快进独立的Git worktree。原研究目录和 `sources/revisions.yaml` 保持固定；严格构建仍核对研究目录的HEAD。遇到本地修改、路径不符、并发运行或历史分叉会报错，不强制重置或覆盖。脚本不安装依赖、不执行上游代码，也不自动改研究结论。

当前机器已设置每天北京时间09:00运行该脚本的Codex本地定时任务；任务依赖本机和Codex处于运行状态。定时配置属于当前机器，不会随Git仓库自动安装到其他机器。

## 组织方式

结合两种参考的长处：

- [Agent Base](https://github.com/giraffe-tree/agent-base)：统一研究切面，既能纵向读一个项目，也能横向比较同一机制；结论回到源码。
- [本地 ReMe 学习手册](http://127.0.0.1:8769/#/lesson/foundations.start.reme)：目录按知识点展开，一页解释一个问题，附例子、边界、来源与口述自测。这个地址属于已有的本地服务，仅供参考。

Memory Base 规划四个阅读入口，共用同一批文章与来源：

| 入口 | 阅读目标 | 示例问题 |
| --- | --- | --- |
| 基础概念 | 建立理解各项目所需的共同语言 | 记忆与上下文有什么区别？保存成功为什么不等于可检索？ |
| 项目拆解 | 跟完一个实现的完整链路 | ReMe 如何把一次对话整理成记忆，再供后续任务使用？ |
| 横向比较 | 用相同问题识别设计差异 | 更新一条事实后，各系统如何处理旧版本和派生索引？ |
| 实验验证 | 把源码判断变成可观察的结果 | 重复写入、崩溃重试、删除来源后，系统实际返回什么？ |

研究重点先放在应用层、Agent 层的外部记忆。参数记忆、模型训练与底层数据库原理作为必要背景展开；会话历史、checkpoint、RAG、长期记忆分别定义，避免仅按名称归为同一类。

## 第一批研究对象

已覆盖ReMe、Mem0与当前Letta Code的源码主线、双项目和三方比较，运行验收仍需按上述范围补充。后续逐步引入其他项目；下表不构成行业完整名单，尚未研究项目仅列候选问题。

| 项目 | 希望验证的问题 | 计划顺序 |
| --- | --- | --- |
| [ReMe](https://github.com/agentscope-ai/ReMe) | 经历、记忆文件、整理任务与检索索引如何衔接？哪些数据是事实来源，哪些可以重建？ | 已完成源码主线 |
| [Mem0](https://github.com/mem0ai/mem0) | 记忆提取、增删改决策、作用域与检索如何实现？SDK 与服务分别承担什么？ | 已完成源码主线与对比 |
| [Letta Code](https://github.com/letta-ai/letta-code) | MemFS已提交core怎样进入模型，渐进读取与历史检索如何分工？本地与Cloud边界在哪里？ | 已完成源码主线与三方比较 |
| [Graphiti](https://github.com/getzep/graphiti) | 事件如何形成实体与关系？如何表达时间、事实变化及其来源？ | 后续扩展 |
| [MemOS](https://github.com/MemTensor/MemOS) | 记忆如何组织、调度和持久化？不同表示与生命周期如何协作？ | 后续扩展 |
| [LangMem](https://github.com/langchain-ai/langmem) | 记忆提取与维护如何嵌入应用运行时？运行时、存储层与应用各自负责什么？ | 后续扩展 |

每个项目必须固定到具体 commit。开源库、托管服务、论文方案分开记录；未开放的服务端实现，只描述官方可确认或黑盒实测的行为。Graphiti 的研究结果也不自动代表 Zep 托管产品的全部实现。

## 用同一组问题拆解架构

先追踪两条链路，再深入模块。它们是阅读索引，具体项目可能合并、跳过或改写其中的步骤。

```text
写入：对话 / 事件 / 资料 → 选择与提取 → 新增 / 更新决策 → 持久化 → 索引更新
读取：当前任务 → 查询构造 → 召回 → 排序与过滤 → 上下文组装 → 模型调用
维护：新事实 / 定时任务 → 冲突处理与整理 → 版本变化 → 索引同步 / 失效
```

各项目沿用相同的研究编号，但不要求把内容强行塞进并不存在的模块。

| 编号 | 切面 | 必须回答的问题 |
| --- | --- | --- |
| 01 | 系统边界 | 谁调用它？是进程内库、独立服务还是 Agent 运行时？哪些动作需要模型参与？ |
| 02 | 记忆模型 | 原始经历、事实、偏好、经验如何表示？ID、时间、来源、用户与项目作用域如何定义？ |
| 03 | 写入链路 | 谁触发提取？何时新增、更新或忽略？重复输入、重试和部分失败如何处理？ |
| 04 | 存储与索引 | 哪一层是事实来源？文件、关系库、向量库、图和缓存分别持有什么？索引能否重建？ |
| 05 | 检索与供给 | 查询如何生成？如何召回、排序、去重与过滤？最终谁把什么内容放进模型上下文？ |
| 06 | 更新与遗忘 | 新旧事实冲突如何处理？时间与适用范围如何保留？删除是否传播到摘要、索引和缓存？ |
| 07 | 运行时与一致性 | 同步、后台任务和调度如何协作？写入何时可见？并发、取消、崩溃和恢复保证是什么？ |
| 08 | 接入与隔离 | SDK、HTTP、MCP、工具调用分别怎么接？宿主生命周期、租户隔离和访问控制在哪里实现？ |
| 09 | 评测与可观测性 | 如何区分写入质量、检索质量与回答效果？能否定位一次错误记忆的来源和传播过程？ |
| 10 | 成本与采用条件 | 模型调用、token、存储、索引和延迟成本是什么？哪些场景适用，哪些前提尚未满足？ |

跨项目比较引用这些章节的证据。没有找到某项实现时，记录“当前研究范围内未确认”，不直接写成“该项目不支持”。

## 目录与课程路由

建议把研究正文保存为 Markdown，把阅读顺序放进课程目录，由构建过程生成网页数据。网页是这些内容的阅读入口，避免另外维护一份完整正文。

以下为内容组织结构。ReMe、Mem0、Letta、基础页、比较、实验与网页已创建；其他项目将在后续研究中加入：

```text
memory-base/
├── README.md
├── docs/
│   ├── foundations/                 # 公共概念，一页一个问题
│   │   └── start/
│   │       ├── memory.md
│   │       ├── context.md
│   │       └── reme.md
│   ├── projects/
│   │   ├── reme/
│   │   │   ├── 01-overview.md
│   │   │   ├── 02-memory-model.md
│   │   │   ├── 03-write-path.md
│   │   │   └── questions/           # 从主线继续拆出的具体问题
│   │   ├── mem0/
│   │   ├── letta/                    # 当前letta-code实现，非旧archive
│   │   ├── graphiti/
│   │   ├── memos/
│   │   └── langmem/
│   └── comparisons/                 # 同一问题的跨项目分析
├── curriculum/
│   └── catalog.yaml                 # 分组、顺序、文章 ID 与推荐学习路径
├── sources/
│   └── revisions.yaml               # 上游地址、commit、核验时间与范围
├── templates/                       # 知识点、项目章节、比较与实验模板
├── experiments/                     # 可复现实验、合成输入、结果与环境说明
├── web/                             # 静态阅读站，搜索、目录、来源和图解
└── refernece/
    ├── ReMe/                         # 独立上游工作副本，Git忽略
    ├── mem0/                         # 独立上游工作副本，Git忽略
    └── letta-code/                   # 当前Letta实现，Git忽略
```

文章使用稳定 ID。ID 不依赖中文标题或目录排序，后续调整标题时仍保留原有链接。

| 页面 | 规划路由 | 内容文件 |
| --- | --- | --- |
| 基础：认识 ReMe | `#/lesson/foundations.start.reme` | `docs/foundations/start/reme.md` |
| 项目：ReMe 写入链路 | `#/lesson/projects.reme.write-path` | `docs/projects/reme/03-write-path.md` |
| 比较：事实更新与冲突 | `#/lesson/comparisons.fact-updates` | `docs/comparisons/fact-updates.md` |
| 实验：重复写入 | `#/lesson/experiments.duplicate-write` | `experiments/duplicate-write/README.md` |

`foundations.start.reme` 只解释 ReMe 在系统中的位置，细节进入项目章节。公共概念不在每个项目中重复编写；项目章节链接到公共概念，再说明自身实现。

第一版采用 Vite + TypeScript，构建时解析 Markdown 与目录，使用 hash 路由。正文由 Markdown 生成并清理 HTML，JSON 数据与 dist 为可丢弃产物，不再维护第二份正文。网页包含目录、全文搜索、来源卡片、前后篇和写入／检索／Dream 交互链路图；刷新知识点地址后仍可定位。

## 每一页应该交付什么

一页围绕一个可以独立解释的问题展开；如果同时涉及多个状态机或调用链，就继续拆页。

1. **问题与结论**：明确这页解释什么，以及结论适用的版本和条件。
2. **具体例子**：沿着一段输入讲清处理过程，区分用户表达、模型判断与程序执行。
3. **机制与状态**：列出调用入口、关键模块、数据流、持久化位置及状态变化。
4. **边界与失败**：说明默认配置、可选能力、失败路径与尚未核验的范围。
5. **来源与自测**：给出固定版本的源码、测试或实验记录，再提出一两个能检验理解的问题。

基础页可以少讲源码细节；项目页应能从入口走到状态落盘，必要时附时序图。比较页说明共同输入与比较条件，不把检索分数、论文数字或不同环境下的延迟直接并排排名。

文章元数据包含 `id`、`title`、`project`、`prerequisites`、`status` 和 `sources`。单项目文章的sources可使用路径字符串；比较文章使用 `project: comparison`、`projects: [reme, mem0]`，每个source显式包含 `project` 与 `path`，分别按对应commit核验。参见 [比较模板](templates/comparison.md)。目录只引用文章ID与排序，构建时检查ID唯一性、引用、项目版本和文件是否存在。

阅读记录与研究证据分开：打开页面仅表示访问过；“已知道”由用户主动勾选。学习进度不改变文章核验状态，不引入账号或云同步；存储范围是同一浏览器的同一站点。

## 证据与实验约定

每条关键结论标明证据类型：

| 标记 | 含义 |
| --- | --- |
| 源码核验 | 固定 commit 的实现、配置或测试直接支持；不等于已经运行通过 |
| 实验验证 | 在记录的环境、输入与配置下观察到；同时列出样本与失败边界 |
| 官方说明 | 来自官方文档、协议或论文；尚未等同于当前代码或当前部署的实际行为 |
| 推断 | 根据已有证据解释设计原因或潜在影响，明确推导依据 |
| 待验证 | 有具体问题，但证据尚不足，不进入确定性比较结论 |

源码链接固定到commit，附文件路径和关键符号。三方比较的每个矩阵单元格给直接支持该判断的源码证据，经多agent只读交叉审阅。构建器检查链接所用仓库、完整SHA与文件是否属于固定Git树；这些结构检查不能代替逐结论的语义核验。记录核验日期、启用配置、依赖版本，以及实际阅读或运行的范围。上游更新后按变更重新核验，不仅修改日期。

实验优先使用可共享的合成数据，每次保留输入、预期、实际结果、运行方式和对应 revision。首批用例围绕同一段项目协作展开：

- **跨会话找回**：第一段对话确定项目约束，第二段任务检查哪些约束被取回并进入实际上下文。
- **事实变化**：先决定使用 Python，之后改用 Rust；检查当前状态、旧历史与来源能否区分。
- **作用域覆盖**：长期偏好“简洁”遇到单次要求“详细”；检查临时要求是否被误记成永久偏好。
- **重复与恢复**：同一输入重复提交、处理途中失败后重试；检查重复记录和部分提交。
- **删除与重建**：删除或更正来源，检查派生记忆与索引的变化，以及重建后能否保持结果。
- **边界隔离**：相同查询用于不同用户或项目，检查作用域过滤；检索内容含指令时，检查宿主如何处理其信任边界。

先观察记忆层保存和返回了什么，再检查宿主是否真正注入上下文、最终回答是否使用正确。检索命中和回答正确分别记录；token、延迟和效果只在相同环境与预算下比较。

## 建设顺序与验收

| 阶段 | 交付 | 完成条件 |
| --- | --- | --- |
| 0 · 研究方案 | README 与远程仓库关联 | 范围、目录、证据口径和推进方式可以评审 |
| 1 · ReMe 样本 | 固定版本，基础页、10 个切面主线与首批实验 | 写入、检索、维护三条链路可追踪；每页有来源，未解问题明确列出 |
| 2 · 阅读站 | Markdown 构建、目录、搜索与稳定路由 | 可直接打开知识点链接，刷新后仍能定位；目录、内容和源码链接一致 |
| 3 · 第二项目 | Mem0 拆解与首份横向比较 | 两个项目使用共同输入，能解释机制差异、代价与适用条件 |
| 4 · 扩展研究 | 按问题引入其他项目 | 每加入一个项目，都带来已有样本无法解释的新设计；维护版本基线与失效证据 |

当前已交付三个项目的源码主线、阅读站、双项目与三方源码比较。完整运行时与真实模型实验尚未完成。下一步固定两边模型、后端、输入与预算，先验证重复提交与事实更正，再观察实际检索和上下文供给；之后按问题引入Graphiti或其他设计。历次基线、分工、失败及验收记录见 [研究记录](sources/research-log.md)。
