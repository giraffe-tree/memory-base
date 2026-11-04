---
id: foundations.start.digest
title: daily 怎样整理成长久可用的知识？
summary: Dream 先提取再整合，最后提交已处理来源版本；它不把所有历史无条件重新整理。
project: reme
minutes: 5
status: source_verified
prerequisites:
- foundations.start.daily
sources:
- reme/steps/evolve/dream/extract.py
- reme/steps/evolve/dream/integrate.py
- reme/steps/evolve/dream/finish.py
- reme/config/default.yaml
---

## 从一次经历，到可复用的内容

daily 可以记录“今天连接池配置导致部署失败”。digest 中的 procedure 可以总结适用条件、处理步骤和检查办法；personal 用于个人相关材料，wiki 用于知识类材料。它们是组织知识的分类，不是准确性等级。

同一条部署经验再次出现时，理想动作可能是补充来源与适用条件；新材料纠正旧结论时，应该整合变化，而不是继续堆积互相矛盾的笔记。

## Dream 的三个阶段

`Extract` 按日期窗口扫描 daily 变化，比较 catalog 中的来源版本，按批次准备材料，再由模型提取知识单元。`Integrate` 结合已有 digest，使用工具新增、佐证、细化或更正知识，并记录结果。`Finish` 根据成功、失败和延后处理的来源，提交可确认的处理水位。

默认扫描窗口是两天，`max_units` 为整轮全局上限5，批次预算字段 `max_chars_per_batch` 为40000。后者按源文件字节估算，不包含提示开销；它用于组织提取批次，不是汉字数、token 或整个模型请求的硬上限，单个超大文件仍可能单独形成更大的批次。

## 为什么要记处理版本

如果提取期间有人修改了 daily，Finish 不能把新的 mtime 当作“已经读过”。`_nodes` 使用 Extract 观察到的版本，让后来修改仍有资格被后续处理。这是在缩小漏处理风险，不是对整个 Dream 过程提供全局事务。

## 删除与失败的边界

扫描窗口之外的旧文件修改不保证立即进入本轮。删除来源可以影响 catalog，但没有因此得到 digest 中每条事实的完整级联撤销保证。某个整合失败后，水位与已产生的文件副作用还需要分别解释。


## 源码定位

- [reme/steps/evolve/dream/extract.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/extract.py)
- [reme/steps/evolve/dream/integrate.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/integrate.py)
- [reme/steps/evolve/dream/finish.py](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/evolve/dream/finish.py)
- [reme/config/default.yaml](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/config/default.yaml)

## 自测

1. 为什么“模型说已经整合”还不足以推进所有来源水位？
2. 来源在提取之后变了，Finish 应记录扫描时版本还是结束时版本？
