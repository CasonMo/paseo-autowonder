# AutoWonder 工作台

Paseo 插件，用一套 MCP 配置管理 AutoWonder。

## 功能

- 工单看板：待处理 / 执行中 / 待决策 / 已完成，卡片展示具体状态节点、执行状态（排队中/执行中/打包中等）、创建者和当前处理人，支持个人范围、类型、关键字筛选。
- 风险雷达：统计停滞、待决策、执行失败、计划未启动和 7 天未更新，可点击筛选。
- 通知中心：只持久化“我参与的”工单新增、状态、指派和内容变化，插件重启后未读仍保留。
- 工单详情：状态流转、快速指派、Markdown 评论时间线（支持表格、标题、列表和代码块）、编辑、暂停恢复、交付恢复、交付控制，以及一键在 AutoWonder 网页打开。
- 工单交付：健康/流转警告/标签/来源信息，交付恢复面板展示执行、重试、错误和重启记录，支持暂停、重试、取消、关闭/重开。
- 工单文档：列出、文本预览、下载到本机、复制路径和删除；预览和下载需要用户确认后通过 AutoWonder CLI 完成，二进制文档请下载后查看。
- 数字员工：在线状态、版本、提交审核、发布、默认 SDLC、仓库/能力绑定。
- 数字员工版本：版本历史、草稿/在线状态、仓库权限、能力/记忆绑定、环境变量（默认打码）和审核意见。
- SDLC：详情展示步骤时间线、处理角色、重试/超时、检查清单和门禁策略（只读）。
- 小队：成员数字员工、关联 SDLC、执行器列表，支持添加/移除成员。
- SDLC、小队、仓库与 Repo Map、能力与分类、定时任务、执行器、记忆的列表与常用操作。
- 定时任务：30 天健康、运行事件时间线、产物、评论、派生工单，以及运行级暂停/恢复/取消。
- 执行监控：按时间窗口汇总活跃、长尾、失败、暂停、成功和取消，支持筛选、搜索和自动刷新。
- 状态模版：只读查看状态节点和推荐流转。
- 全部工具：动态读取 MCP `tools/list`，按 JSON Schema 生成表单；创建工单默认只展示类型、标题和正文，其余参数折叠，可选参数使用下拉选择，工具和字段说明收进问号浮层。
- 能力库：详情展示包信息、installSpec，并提供平台技能目录一键安装。
- 安全：executor token、CLI token、数字员工环境变量等敏感结果默认打码。
- 界面语言：支持简体中文和英文，默认跟随 Paseo，也可在插件设置中切换。

## 配置

在 Paseo 中打开插件设置，填写 AutoWonder 的 MCP URL。该地址通常包含个人访问 token，保存在本机 daemon 的插件设置中，请不要分享。工单详情里的“在 AutoWonder 打开”默认从 MCP URL 推导网页地址；内网或独立部署可另外填写网页根地址，例如 `http://autowonder.example.com:7001`。该链接只使用网页地址和 `/workitems/<id>`，不会携带 MCP token。

## 开发

```bash
cd paseo-autowonder
npm install
npm run typecheck
npm test
paseo plugin reload autowonder-workbench
paseo plugin logs autowonder-workbench
```

## 结构

- `server/mcp.ts`：MCP Streamable HTTP 客户端，支持 JSON 与 SSE 响应、`Mcp-Session-Id` 和 session 失效重连。
- `shared/contracts.ts`：设置与 RPC 契约。
- `client/`：工作台、资源列表/详情、动态工具表单和品牌图标。
- `assets/icon.png`：插件图标。
