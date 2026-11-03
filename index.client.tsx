import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ackChangesRpc, autowonderSettings } from "./shared/contracts";
import { BoardScreen } from "./client/BoardScreen";
import { ChangeIndicator, ChangePopover } from "./client/ChangePopover";
import { changesQueryKey, useChanges } from "./client/changes";
import { BOARD_SCREEN, SETTINGS_SCREEN } from "./client/constants";
import { AUTO_WONDER_ICON_SVG, AutoWonderMark } from "./client/icons";
import { AutoWonderSettingsScreen } from "./client/SettingsScreen";
import {
  I18nProvider,
  preferenceFromSettings,
  setHostLocale,
} from "./client/i18n";

function AutoWonderItemContent({
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

function AutoWonderItem(props: PluginSidebarItemProps) {
  const settings = useSettings(autowonderSettings);
  const preference =
    settings.status === "ready" ? preferenceFromSettings(settings.values) : "auto";
  return (
    <I18nProvider preference={preference}>
      <AutoWonderItemContent {...props} />
    </I18nProvider>
  );
}

function LocalizedBoardScreen(props: Parameters<typeof BoardScreen>[0]) {
  const settings = useSettings(autowonderSettings);
  const preference =
    settings.status === "ready" ? preferenceFromSettings(settings.values) : "auto";
  return (
    <I18nProvider preference={preference}>
      <BoardScreen {...props} />
    </I18nProvider>
  );
}

export default function contribute(client: PluginClientContext) {
  let appLocale = "zh-CN";
  try {
    appLocale = client.i18n.locale;
    setHostLocale(appLocale);
  } catch {
    // The host may not expose a runtime locale; keep the Chinese default.
  }
  const localized = appLocale.toLowerCase().startsWith("zh");
  const screenTitle = localized ? "AutoWonder 工作台" : "AutoWonder Workbench";
  const settingsTitle = localized
    ? "AutoWonder 工作台设置"
    : "AutoWonder Workbench settings";
  client.addScreen({
    id: BOARD_SCREEN,
    title: screenTitle,
    Component: LocalizedBoardScreen,
  });
  client.addSettingsScreen({
    id: SETTINGS_SCREEN,
    title: screenTitle,
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
    title: localized ? "打开 AutoWonder 工作台" : "Open AutoWonder Workbench",
    icon: { svg: AUTO_WONDER_ICON_SVG },
    keywords: ["autowonder", "aw", "工单", "数字员工", "sdlc", "定时任务", "记忆"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: BOARD_SCREEN });
    },
  });
  client.addCommandCenterItem({
    id: "autowonder-open-settings",
    title: settingsTitle,
    icon: "Settings",
    keywords: ["autowonder", "mcp", "设置", "url", "token"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings(SETTINGS_SCREEN);
    },
  });
  client.addSlashCommand({
    name: "aw",
    description: localized ? "打开 AutoWonder 工作台" : "Open AutoWonder Workbench",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openScreen }) {
      openScreen({ screenId: BOARD_SCREEN });
    },
  });
  return () => {};
}
