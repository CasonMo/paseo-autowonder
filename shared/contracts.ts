import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const WORKITEM_STATUS_CATEGORIES = [
  "NEW",
  "IN_PROGRESS",
  "PENDING_DECISION",
  "DONE",
  "CANCELED",
] as const;

export const WORKITEMS_PER_STATUS = 100;

export type WorkitemStatusCategory = (typeof WORKITEM_STATUS_CATEGORIES)[number];

export const autowonderSettingsSchema = z.object({
  /** AutoWonder 的 MCP HTTP 地址，通常包含个人访问 token。 */
  mcpUrl: z.string().default(""),
  /** AutoWonder 网页根地址；留空时从 MCP URL 自动推导。 */
  webBaseUrl: z.string().default(""),
  /** 工单变化轮询间隔（秒）；0 表示关闭。 */
  pollIntervalSeconds: z.number().int().min(0).max(3600).default(60),
  /** 是否在工单看板顶部显示风险雷达。 */
  riskRadarEnabled: z.boolean().default(true),
  /** 是否允许插件通过 npx 下载并运行 AutoWonder CLI 完成文档下载。 */
  documentCliConsent: z.boolean().default(false),
  /** auto 跟随 Paseo；也可固定为 English 或简体中文。 */
  uiLocale: z.enum(["auto", "zh-CN", "en"]).default("auto"),
});

export type AutoWonderSettingsValues = z.infer<typeof autowonderSettingsSchema>;

export const autowonderSettings = defineSettings({
  id: "autowonder-workbench-config",
  scope: "host",
  version: 5,
  schema: autowonderSettingsSchema,
  migrate: (values, fromVersion) => {
    const previous = (values ?? {}) as Record<string, unknown>;
    if (fromVersion >= 5) return previous;
    return {
      ...previous,
      webBaseUrl: typeof previous.webBaseUrl === "string" ? previous.webBaseUrl : "",
      pollIntervalSeconds:
        typeof previous.pollIntervalSeconds === "number" ? previous.pollIntervalSeconds : 60,
      riskRadarEnabled:
        typeof previous.riskRadarEnabled === "boolean" ? previous.riskRadarEnabled : true,
      documentCliConsent:
        typeof previous.documentCliConsent === "boolean" ? previous.documentCliConsent : false,
      uiLocale:
        previous.uiLocale === "zh-CN" || previous.uiLocale === "en" || previous.uiLocale === "auto"
          ? previous.uiLocale
          : "auto",
    };
  },
});

export const toolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>;

export const pingRpc = defineRpc({
  name: "autowonder.ping",
  input: z.object({ url: z.string().optional() }),
  output: z.object({
    ok: z.boolean(),
    toolCount: z.number().int().nonnegative(),
    serverName: z.string().optional(),
    serverVersion: z.string().optional(),
    protocolVersion: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const listToolsRpc = defineRpc({
  name: "autowonder.list_tools",
  input: z.object({}),
  output: z.object({
    tools: z.array(toolDescriptorSchema),
    serverName: z.string().optional(),
    serverVersion: z.string().optional(),
    protocolVersion: z.string().optional(),
  }),
});

export const callToolRpc = defineRpc({
  name: "autowonder.call_tool",
  input: z.object({
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  output: z.object({
    data: z.unknown(),
    isError: z.boolean(),
    contentText: z.string().optional(),
  }),
});

const workitemChangeSchema = z.object({
  key: z.string(),
  revision: z.number().int(),
  read: z.boolean(),
  updatedAt: z.string(),
  workspaceId: z.number().int(),
  workspaceName: z.string().optional(),
  id: z.number().int(),
  title: z.string(),
  workType: z.string().optional(),
  statusName: z.string().optional(),
  changes: z.array(z.enum(["new", "status", "assignee", "updated"])),
  oldStatusName: z.string().optional(),
  newStatusName: z.string().optional(),
  oldAssignee: z.string().optional(),
  newAssignee: z.string().optional(),
  gmtModified: z.string().optional(),
});

export const changeStateSchema = z.object({
  revision: z.number().int(),
  ackRevision: z.number().int(),
  intervalSeconds: z.number().int(),
  lastPollAt: z.string().optional(),
  error: z.string().optional(),
  newCount: z.number().int().nonnegative(),
  statusCount: z.number().int().nonnegative(),
  assigneeCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  items: z.array(workitemChangeSchema),
  history: z.array(workitemChangeSchema),
});

export type ChangeState = z.infer<typeof changeStateSchema>;
export type WorkitemChange = z.infer<typeof workitemChangeSchema>;

export const changesRpc = defineRpc({
  name: "autowonder.changes",
  input: z.object({}),
  output: changeStateSchema,
});

export const ackChangesRpc = defineRpc({
  name: "autowonder.ack_changes",
  input: z.object({}),
  output: changeStateSchema,
});

export const ackChangeRpc = defineRpc({
  name: "autowonder.ack_change",
  input: z.object({ key: z.string().min(1) }),
  output: changeStateSchema,
});

export const refreshChangesRpc = defineRpc({
  name: "autowonder.refresh_changes",
  input: z.object({}),
  output: changeStateSchema,
});

const downloadedDocumentSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  path: z.string(),
  size: z.number().int().nonnegative().optional(),
});

export const downloadWorkitemDocumentRpc = defineRpc({
  name: "autowonder.download_workitem_document",
  input: z.object({
    workspaceId: z.number().int(),
    workitemId: z.number().int(),
    fileName: z.string().optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    outputDir: z.string().optional(),
    downloaded: z.array(downloadedDocumentSchema).default([]),
    error: z.string().optional(),
    needsConsent: z.boolean().optional(),
  }),
});

export const previewWorkitemDocumentRpc = defineRpc({
  name: "autowonder.preview_workitem_document",
  input: z.object({
    workspaceId: z.number().int(),
    workitemId: z.number().int(),
    fileName: z.string().min(1),
  }),
  output: z.object({
    ok: z.boolean(),
    name: z.string().optional(),
    content: z.string().optional(),
    truncated: z.boolean().optional(),
    error: z.string().optional(),
    needsConsent: z.boolean().optional(),
  }),
});
