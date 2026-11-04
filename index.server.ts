import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  ackChangeRpc,
  ackChangesRpc,
  autowonderSettings,
  callToolRpc,
  changesRpc,
  downloadWorkitemDocumentRpc,
  listToolsRpc,
  pingRpc,
  previewWorkitemDocumentRpc,
  refreshChangesRpc,
  type AutoWonderSettingsValues,
} from "./shared/contracts";
import { callTool, listTools } from "./server/mcp";
import { ChangeTracker } from "./server/changes";
import {
  downloadWorkitemDocument,
  previewWorkitemDocument,
} from "./server/documents";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(autowonderSettings);
  const changes = new ChangeTracker();

  async function readSettings(): Promise<AutoWonderSettingsValues> {
    const state = await settings.read();
    if (state.status === "invalid") {
      throw new Error(`AutoWonder 配置无效：${state.error}`);
    }
    return state.values;
  }

  async function resolveUrl(override?: string): Promise<string> {
    const value = (override ?? (await readSettings()).mcpUrl).trim();
    if (!value) {
      throw new Error("尚未配置 AutoWonder MCP URL，请先在插件设置中填写。");
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("MCP URL 格式不正确，请填写完整的 http(s) 地址。");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("MCP URL 仅支持 http 或 https。");
    }
    return value;
  }

  server.handle(pingRpc, async ({ url }) => {
    try {
      const target = await resolveUrl(url);
      const result = await listTools(target);
      return {
        ok: true,
        toolCount: result.tools.length,
        serverName: result.serverName,
        serverVersion: result.serverVersion,
        protocolVersion: result.protocolVersion,
      };
    } catch (error) {
      return {
        ok: false,
        toolCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  server.handle(listToolsRpc, async () => {
    return listTools(await resolveUrl());
  });

  server.handle(callToolRpc, async ({ name, arguments: args }) => {
    return callTool(await resolveUrl(), name, args);
  });

  server.handle(changesRpc, () => changes.getState());
  server.handle(ackChangesRpc, () => changes.ack());
  server.handle(ackChangeRpc, ({ key }) => changes.ackOne(key));
  server.handle(refreshChangesRpc, () => changes.refresh());
  server.handle(
    downloadWorkitemDocumentRpc,
    async ({ workspaceId, workitemId, fileName }) => {
      const values = await readSettings();
      return downloadWorkitemDocument(
        await resolveUrl(),
        workspaceId,
        workitemId,
        fileName,
        values.documentCliConsent,
      );
    },
  );
  server.handle(
    previewWorkitemDocumentRpc,
    async ({ workspaceId, workitemId, fileName }) => {
      const values = await readSettings();
      return previewWorkitemDocument(
        await resolveUrl(),
        workspaceId,
        workitemId,
        fileName,
        values.documentCliConsent,
      );
    },
  );

  const syncChanges = async () => {
    try {
      const values = await readSettings();
      changes.configure(values.mcpUrl.trim(), values.pollIntervalSeconds);
    } catch {
      changes.configure("", 0);
    }
  };
  void syncChanges();
  const unsubscribeChanges = settings.subscribe(() => {
    void syncChanges();
  });

  void (async () => {
    try {
      const values = await readSettings();
      if (!values.mcpUrl.trim()) {
        console.log("[autowonder-workbench] 尚未配置 MCP URL");
        return;
      }
      const result = await listTools(await resolveUrl());
      console.log(
        `[autowonder-workbench] MCP 就绪：${result.serverName ?? "autowonder"} ${result.serverVersion ?? ""}，${result.tools.length} 个工具`,
      );
    } catch {
      console.warn(
        "[autowonder-workbench] MCP 自检失败，请检查 MCP URL、访问令牌或服务可用性。",
      );
    }
  })();

  return () => {
    unsubscribeChanges();
    changes.stop();
  };
}
