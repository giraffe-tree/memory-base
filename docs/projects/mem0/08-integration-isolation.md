---
id: projects.mem0.integration-isolation
title: Python OSS、托管客户端和自托管 REST 是同一接口吗？
summary: 三种入口的执行位置、路由、认证和参数契约不同；作用域过滤不能代替认证身份与数据归属绑定。
project: mem0
minutes: 9
status: source_verified
prerequisites: [projects.mem0.overview, projects.mem0.memory-model]
sources: [mem0/memory/main.py, mem0/client/main.py, server/main.py, server/auth.py, tests/test_server_auth.py, tests/test_server_params.py]
---

## 结论：先选实现表面，再写接入代码

`Memory` 在应用进程内执行开源提取和检索；`MemoryClient` 通过 HTTP 访问托管平台；`server/` 是包装 OSS 的独立 FastAPI 服务。这三者共享一些概念与方法名，但不等于路由、认证和能力完全相同。

本页固定 `ed1f10fc8708`。托管侧只能核验客户端发出的请求和返回处理，服务端内部实现不在这些源码中；自托管服务已包含认证，不能套用早期无认证版本的判断。

## 三种入口的边界

| 入口 | 工作发生在哪里 | 当前接入契约 |
| --- | --- | --- |
| `Memory` / `AsyncMemory` | 调用应用与配置的 provider | 进程内 Python API；应用自行管理身份与资源 |
| `MemoryClient` / 异步客户端 | 本地 HTTP 客户端与托管平台 | 默认 `api.mem0.ai`，Token 认证，V3 新增与检索等平台路由 |
| 自托管 REST | FastAPI 进程与 OSS Memory | `/memories`、`/search` 等路由，JWT 或 X-API-Key |

托管客户端初始化会 ping 平台验证 key，并非一个只保存参数的轻量构造器。把它的 host 改成自托管地址仍会遇到路由、header 和响应契约差异，不应声称直接兼容。

## 作用域参数已经变化

当前 OSS 的新增仍把 `user_id`、`agent_id`、`run_id` 放在 add 顶层，且至少提供一个；metadata 中的同名身份字段会被剥离。search 与 get_all 则要求把身份放进 `filters`，拒绝顶层身份参数。

```python
# 当前 Python OSS 的调用形状；这里未执行外部模型请求。
m.add("项目改用 Rust", user_id="study-user", metadata={"project": "demo"})
m.search("项目语言是什么？", filters={"user_id": "study-user", "project": "demo"})
```

托管客户端也对 search/get_all 拒绝顶层身份，但 add、delete_all 等方法有各自规则。不要写一个把所有方法参数一律移进 filters 的适配器。

REST 的 SearchRequest 暂时接收被标记 deprecated 的顶层身份，将它们合入 filters 再调用 OSS，并记录告警；这属于兼容包装，不代表 Python OSS 也接受同样形式。REST get_all 又以查询参数接收身份。文档示例必须注明具体入口。

## 认证支持已存在，但不等于行级租户隔离

`verify_auth` 支持 Bearer access JWT、用户 API key，以及环境变量中的 legacy admin key；显式 `AUTH_DISABLED=true` 可以关闭认证。管理员接口另用 `require_admin`，例如修改配置、批量删除和 reset；无作用域列出全部记忆也有管理员限制。

但普通 get/update/delete/history 路由获得 `_auth` 后，仍直接按传入 memory ID 调用共享 Memory。search 和有作用域 get_all 使用调用方传入的 user_id，并未在这些路由中强制替换为认证 User.id。因此“必须登录”与“只能读写自己的记忆”是不同事实。

若要服务不互信的租户，应用还要把认证身份绑定到允许的记忆作用域，对按 ID 操作执行归属验证，限制用户自选其他 scope，并核对数据库与网络部署。随机 ID 的不可猜测性也不能替代授权。这里是基于所读路由的静态分析，没有实际尝试跨用户访问。

## 宿主仍负责记忆何时发挥作用

Mem0 保存或返回记忆，不自动替任意 Agent 管理完整生命周期。宿主决定哪些消息值得发送、使用什么作用域、何时查找、怎样把结果与当前请求一起发给模型。检索成功但结果没进入上下文，属于接线未完成。

接入验收应分别检查通信成功、写入结果、跨会话找回、作用域边界和最终回答。托管可用的额外参数也不能在 OSS 中静默忽略，例如 OSS 明确拒绝 timestamp/reference_date 等平台时间功能参数。

## 源码定位

- [OSS 作用域验证与平台参数拒绝](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/memory/main.py)：`add`、`search`、`get_all`。
- [托管路由与 Token header](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/mem0/client/main.py)：`MemoryClient`。
- [REST 路由与身份参数兼容](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/main.py)。
- [认证与管理员检查](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/server/auth.py)。
- [REST 参数契约测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/test_server_params.py) · [认证测试](https://github.com/mem0ai/mem0/blob/ed1f10fc87080f0b67f99be370817504888462ab/tests/test_server_auth.py)。

## 自测

1. 为什么替换 MemoryClient 的 host，不能自动把它变成 OSS REST 客户端？
2. 路由已验证 JWT，为什么仍需要把 User.id 与记忆 user_id 绑定？
