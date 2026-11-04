# AutoWonder 工作台

Paseo 插件，用一套 MCP 配置管理 AutoWonder。

## 功能

- 工单看板：待处理 / 执行中 / 待决策 / 已完成，支持个人范围、类型、关键字筛选。
- 风险雷达：统计停滞、待决策、执行失败、计划未启动和 7 天未更新，可点击筛选。
- 通知中心：只持久化“我参与的”工单新增、状态、指派和内容变化，插件重启后未读仍保留。
- 工单详情：状态流转、快速指派、评论时间线、编辑、暂停恢复、交付恢复、交付控制，以及一键在 AutoWonder 网页打开。
- 工单文档：列出、下载到本机、复制路径和删除；下载需要用户确认后通过 AutoWonder CLI 完成。
- 数字员工：在线状态、版本、提交审核、发布、默认 SDLC、仓库/能力绑定。
- SDLC、小队、仓库与 Repo Map、能力与分类、定时任务、执行器、记忆的列表与常用操作。
- 执行监控：按时间窗口汇总活跃、长尾、失败、暂停、成功和取消，支持筛选、搜索和自动刷新。
- 状态模版：只读查看状态节点和推荐流转。
- 全部工具：动态读取 MCP `tools/list`，按 JSON Schema 生成表单，新工具无需改插件。
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
