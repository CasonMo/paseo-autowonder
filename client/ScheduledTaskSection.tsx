import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import type { ToolDescriptor } from "../shared/contracts";
import { ResourceSection } from "./ResourceSection";
import { scheduledTaskResource } from "./resources";
import { asNumber } from "./lib";
import { useWorkspaceNameMaps } from "./workspace-names";

export function ScheduledTaskSection({
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
  const { agentNames, squadNames } = useWorkspaceNameMaps(workspaceId);
  const decorateItem = useMemo(
    () => (item: Record<string, unknown>): Record<string, unknown> => {
      const squadId = asNumber(item.squadId);
      const initialAgentId = asNumber(item.initialAgentId);
      const squadLabel =
        squadId !== undefined
          ? `${squadNames.get(squadId) ?? "小队"} #${squadId}`
          : "—";
      const initialAgentLabel =
        initialAgentId !== undefined
          ? `${agentNames.get(initialAgentId) ?? "数字员工"} #${initialAgentId}`
          : "—";
      return { ...item, squadLabel, initialAgentLabel };
    },
    [agentNames, squadNames],
  );

  return (
    <ResourceSection
      resource={scheduledTaskResource}
      workspaceId={workspaceId}
      theme={theme}
      compact={compact}
      tools={tools}
      decorateItem={decorateItem}
      onOpenDetail={onOpenDetail}
    />
  );
}
