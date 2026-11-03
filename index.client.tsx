import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ackChangesRpc } from "./shared/contracts";
import { BoardScreen } from "./client/BoardScreen";
import { ChangeIndicator, ChangePopover } from "./client/ChangePopover";
import { changesQueryKey, useChanges } from "./client/changes";
import { BOARD_SCREEN, SETTINGS_SCREEN } from "./client/constants";
import { AUTO_WONDER_ICON_SVG, AutoWonderMark } from "./client/icons";
import { AutoWonderSettingsScreen } from "./client/SettingsScreen";

function AutoWonderItem({
  currentScreen,
  theme,
  openScreen,
  openPopover,
}: PluginSidebarItemProps) {
  const changes = useChanges();
  const ack = useRpc(ackChangesRpc);
  const queryClient = useQueryClient();

  async function markRead() {
    if (!changes.data || changes.data.totalCount === 0) return;
    try {
      const state = await ack({});
      queryClient.setQueryData(changesQueryKey, state);
    } catch {
      // The next poll keeps the indicator visible.
    }
  }

  return (
    <SidebarRow
      icon={AutoWonderMark}
      active={currentScreen?.screenId === BOARD_SCREEN}
      trailing={
        <ChangeIndicator
          data={changes.data}
          theme={theme}
          onPress={() => openPopover(ChangePopover)}
        />
      }
      onPress={() => {
        openScreen({ screenId: BOARD_SCREEN });
        void markRead();
      }}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: BOARD_SCREEN,
    title: "AutoWonder 工作台",
    Component: BoardScreen,
  });
  client.addSettingsScreen({
    id: SETTINGS_SCREEN,
    title: "AutoWonder 工作台",
    icon: "Settings",
    Component: AutoWonderSettingsScreen,
  });
  client.addSidebarHeaderItem({
    id: "autowonder",
    title: "AutoWonder",
    Component: AutoWonderItem,
  });
  client.addCommandCenterItem({
    id: "autowonder-open-board",
    title: "打开 AutoWonder 工作台",
    icon: { svg: AUTO_WONDER_ICON_SVG },
    keywords: ["autowonder", "aw", "工单", "数字员工", "sdlc", "定时任务", "记忆"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: BOARD_SCREEN });
    },
  });
  client.addCommandCenterItem({
    id: "autowonder-open-settings",
    title: "AutoWonder 工作台设置",
    icon: "Settings",
    keywords: ["autowonder", "mcp", "设置", "url", "token"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings(SETTINGS_SCREEN);
    },
  });
  client.addSlashCommand({
    name: "aw",
    description: "打开 AutoWonder 工作台",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openScreen }) {
      openScreen({ screenId: BOARD_SCREEN });
    },
  });
  return () => {};
}
