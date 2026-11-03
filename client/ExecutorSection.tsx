import type { PluginTheme } from "@getpaseo/plugin";
import type { ToolDescriptor } from "../shared/contracts";
import { ResourceSection } from "./ResourceSection";
import { executorResource } from "./resources";
import { asNumber, asString } from "./lib";
import { useI18n } from "./i18n";

function withAgentLabel(
  item: Record<string, unknown>,
  t: (text: string) => string,
): Record<string, unknown> {
  const agentId = asNumber(item.agentId);
  const agentName = asString(item.agentName);
  return {
    ...item,
    agentLabel:
      agentId !== undefined
        ? `${agentName || t("数字员工")} #${agentId}`
        : agentName || "—",
  };
}

export function ExecutorSection({
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
  const { t } = useI18n();
  return (
    <ResourceSection
      resource={executorResource}
      workspaceId={workspaceId}
      theme={theme}
      compact={compact}
      tools={tools}
      decorateItem={(item) => withAgentLabel(item, t)}
      onOpenDetail={onOpenDetail}
    />
  );
}
