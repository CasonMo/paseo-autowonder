import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { callToolRpc, type ToolDescriptor } from "../shared/contracts";
import { ResourceSection } from "./ResourceSection";
import { memoryResource } from "./resources";
import { asNumber, asString, displayStatus, listItems } from "./lib";

export function MemorySection({
  workspaceId,
  theme,
  compact,
  tools,
  onOpenDetail,
}: {
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  tools: ToolDescriptor[];
  onOpenDetail?: (
    item: Record<string, unknown>,
    resource: import("./ResourceSection").ResourceDef,
    decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}) {
  const call = useRpc(callToolRpc);
  const agentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "memory-owner-agents"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_agents",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "数字员工加载失败");
      return response.data;
    },
    retry: 1,
  });
  const squadsQuery = useQuery({
    queryKey: ["aw", workspaceId, "memory-owner-squads"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_squads",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "小队加载失败");
      return response.data;
    },
    retry: 1,
  });

  const decorateItem = useMemo(() => {
    const agentNames = new Map<number, string>();
    const squadNames = new Map<number, string>();
    for (const agent of listItems(agentsQuery.data, "items")) {
      const id = asNumber(agent.id);
      if (id !== undefined) agentNames.set(id, asString(agent.name));
    }
    for (const squad of listItems(squadsQuery.data, "items")) {
      const id = asNumber(squad.id);
      if (id !== undefined) squadNames.set(id, asString(squad.name));
    }

    return (item: Record<string, unknown>): Record<string, unknown> => {
      const scope = asString(item.scope);
      const ownerRef = asNumber(item.ownerRef);
      let ownerName = "—";
      if (scope === "ORG") {
        ownerName = "组织共享";
      } else if (scope === "SQUAD") {
        const name = ownerRef !== undefined ? squadNames.get(ownerRef) : undefined;
        ownerName =
          ownerRef !== undefined
            ? `${name ?? "小队"} #${ownerRef}`
            : "小队";
      } else if (scope === "AGENT") {
        const name = ownerRef !== undefined ? agentNames.get(ownerRef) : undefined;
        ownerName =
          ownerRef !== undefined
            ? `${name ?? "数字员工"} #${ownerRef}`
            : "数字员工";
      } else if (ownerRef !== undefined) {
        ownerName = `#${ownerRef}`;
      }
      return { ...item, ownerName, scopeName: displayStatus(scope) };
    };
  }, [agentsQuery.data, squadsQuery.data]);

  return (
    <ResourceSection
      resource={memoryResource}
      workspaceId={workspaceId}
      theme={theme}
      compact={compact}
      tools={tools}
      decorateItem={decorateItem}
      onOpenDetail={onOpenDetail}
    />
  );
}
