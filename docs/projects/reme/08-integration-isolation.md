---
id: projects.reme.integration-isolation
title: SDK、HTTP 与 MCP 怎样接入，隔离边界在哪里？
summary: 协议入口最终调度 Job，但暴露范围、返回格式、文件边界与用户身份验证是不同责任。
project: reme
minutes: 8
status: source_verified
prerequisites: [projects.reme.overview, projects.reme.runtime-consistency]
sources: [reme/application.py, reme/reme.py, reme/constants.py, reme/components/service/base_service.py, reme/components/service/http_service.py, reme/components/service/mcp_service.py, reme/components/service/mcp_tools.py, reme/steps/file_io/_path.py, tests/unit/test_service.py]
---

## 结论：同一套 Job，可以有多个协议入口

调用 `Application.run_job` 属于进程内函数调用；HTTP 客户端访问网络服务；MCP 客户端通过工具协议调用服务暴露的 Job。模型提出工具调用之后，真正执行请求和文件操作的是宿主及服务程序。它们可以连接同一套能力，但不是同一个协议，也不天然共享同一组安全保证。

当前默认配置启动 HTTP，允许同时挂载 MCP 与可选 Studio 静态页面。默认监听地址是 `127.0.0.1:2333`。这里核验的是 `d323356e6f11` 的配置与入口实现，尚未运行真实宿主接入。

## 一个请求怎样到达步骤

进程内，`Application.run_job(name, **kwargs)` 找到已启用 Job，再调用它。CLI 的 `start` 启动配置好的服务；其他命令选择客户端发起调用。常规使用可分两终端：先运行 `reme start`，然后在另一终端调用 `reme search query="项目语言"`。这些是上游接口示例，当前研究站不会替你启动 ReMe 服务或调用模型。

HTTP 为普通 Job 注册 `POST /{job.name}`，请求解析成 Request，再展开参数交给 Job，返回 Response。流式 Job 使用 SSE 路径；不能仅因为端口相同就把 SSE 当成 MCP。

MCP 由 FastMCP 注册 FunctionTool，工具参数描述来自 Job 的 `parameters`。独立 MCP 服务支持 stdio、SSE 和 streamable-http，HTTP 服务也能在 `/mcp` 挂载 streamable-http。传输方式不同，不会自动改变 Job 的内部业务语义。

## 暴露范围和返回格式要单独检查

`BaseService.add_jobs` 检查 Job 的 `enabled`、`enable_serve` 以及可选服务白名单。后台任务强制不对外暴露；MCP 跳过 StreamJob。显式白名单包含不存在、不允许暴露或不支持的 Job 时会报错，避免悄悄遗漏。

`add_mcp_job.execute_tool` 默认返回 `response.answer`，并非整个 Response 元数据。若宿主需要结构化的来源、分数或处理状态，必须检查它实际拿到的是哪一种返回接口。`tool_error_on_failure` 开启后才把失败 Response 转成 ToolError；默认参数为 false，宿主不能只根据“工具协议成功返回”判定业务成功。

服务可注入固定工具参数，注入字段会从 MCP schema 中去掉；调用方重复提交同名字段会失败。这能保护服务拥有的上下文参数，但该实现位于 MCP 包装器，不能直接推导所有 HTTP 路径也具有相同注入契约。

宿主接入还要决定何时保存、何时检索、如何关联 session，以及返回内容是否进入下一次模型调用。仅把工具注册到 MCP 客户端，不会自动完成这些生命周期选择；一次工具连接成功也不能替代跨会话记忆验收。

## 文件限制不等于多租户鉴权

文件路径解析拒绝 workspace 逃逸，并可对支持的文件操作施加请求级 `_allowed_paths`。这些控制回答“本次文件工具可访问什么”，并不回答“请求是谁发送的、属于哪个租户”。例如删除步骤与读写步骤的限制入口需要分别读，不能把某个工具的检查概括成所有 Job 的统一授权层。

当前 `HttpService.build_service` 配置通配 CORS，所读入口没有配置身份认证中间件。CORS 也不是认证。默认 loopback 适合本地使用；若扩展为多个用户共用的网络服务，需要自行明确身份验证、workspace 分配、Job 白名单、访问日志和网络边界。这里没有验证共享实例能否安全服务多租户，因此不把 workspace 文件边界写成租户隔离保证。

## 源码定位

- [进程内入口：Application.run_job](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/application.py)
- [网络端点、MCP 挂载与 CORS：HttpService](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/service/http_service.py)
- [Job 暴露过滤：BaseService.add_jobs](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/service/base_service.py)
- [工具返回与参数注入：add_mcp_job](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/components/service/mcp_tools.py)
- [文件路径与允许范围](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/reme/steps/file_io/_path.py)
- [服务白名单和注入参数测试](https://github.com/agentscope-ai/ReMe/blob/d323356e6f11c0faf4bf30fae7a2edc30e18fbb9/tests/unit/test_service.py)

## 自测

1. 为什么 MCP 工具调用完成后，宿主仍可能需要判断业务是否失败？
2. 若把本地服务改成公网监听，还必须补上哪些当前源码未提供的部署责任？
