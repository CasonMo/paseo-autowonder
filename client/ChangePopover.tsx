import type { PluginPopoverProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./Text";
import {
  ackChangesRpc,
  autowonderSettings,
  refreshChangesRpc,
  WORKITEMS_PER_STATUS,
  type ChangeState,
  type WorkitemChange,
} from "../shared/contracts";
import { Button, Divider, Row, textStyle } from "./components";
import { BOARD_SCREEN } from "./constants";
import { useChanges, changesQueryKey } from "./changes";
import { errorMessage, formatDateTime } from "./lib";
import { I18nProvider, preferenceFromSettings, useI18n } from "./i18n";

function ChangePill({
  label,
  color,
  foreground,
}: {
  label: string;
  color: string;
  foreground: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: color,
      }}
    >
      <Text style={{ color: foreground, fontSize: 10, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function changeTagLabel(change: string): string {
  if (change === "new") return "新增";
  if (change === "status") return "状态";
  if (change === "assignee") return "指派";
  return "更新";
}

export function ChangeIndicator({
  data,
  theme,
  onPress,
}: {
  data: ChangeState | undefined;
  theme: PluginPopoverProps["theme"];
  onPress: () => void;
}) {
  if (!data) return null;
  const total = data.totalCount;
  if (total === 0 && !data.error) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        data.error
          ? "工单变化检查失败"
          : `工单变化：共 ${total} 条，其中新增 ${data.newCount} 条`
      }
      hitSlop={6}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
    >
      {total > 0 ? (
        <ChangePill
          label={String(total)}
          color={theme.colors.statusWarning}
          foreground={theme.colors.surface0}
        />
      ) : null}
      {data.error ? (
        <ChangePill
          label="!"
          color={theme.colors.statusDanger}
          foreground={theme.colors.surface0}
        />
      ) : null}
    </Pressable>
  );
}

function ChangePopoverContent({
  theme,
  layout,
  close,
  openScreen,
}: PluginPopoverProps) {
  const { t } = useI18n();
  const changes = useChanges();
  const ack = useRpc(ackChangesRpc);
  const refresh = useRpc(refreshChangesRpc);
  const queryClient = useQueryClient();
  const data = changes.data;

  async function markRead() {
    try {
      const state = await ack({});
      queryClient.setQueryData(changesQueryKey, state);
    } catch {
      // The next poll keeps the state visible.
    }
  }

  async function refreshNow() {
    try {
      const state = await refresh({});
      queryClient.setQueryData(changesQueryKey, state);
    } catch {
      // The error is rendered from the next query state.
    }
  }

  function openBoard() {
    void markRead();
    openScreen({ screenId: BOARD_SCREEN });
    close();
  }

  function openNotifications() {
    openScreen({ screenId: BOARD_SCREEN, params: { section: "notifications" } });
    close();
  }

  return (
    <View style={{ gap: 10, width: layout.compact ? undefined : 330, minWidth: 270 }}>
      <Row gap={8}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600", flex: 1 }}>
          工单变化
        </Text>
        <Button
          label="刷新"
          icon="RefreshCw"
          iconOnly
          theme={theme}
          compact
          disabled={changes.isFetching}
          onPress={() => void refreshNow()}
        />
      </Row>

      {changes.isLoading ? (
        <Text style={textStyle(theme, 12, true)}>读取变化…</Text>
      ) : null}
      {changes.error ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
          {errorMessage(changes.error)}
        </Text>
      ) : null}
      {data ? (
        <>
          <Row gap={5}>
            {data.newCount > 0 ? (
              <ChangePill
                label={t("新增 {{count}}", { count: data.newCount })}
                color={theme.colors.statusSuccess}
                foreground={theme.colors.surface0}
              />
            ) : null}
            {data.statusCount > 0 ? (
              <ChangePill
                label={t("状态 {{count}}", { count: data.statusCount })}
                color={theme.colors.statusWarning}
                foreground={theme.colors.surface0}
              />
            ) : null}
            {data.assigneeCount > 0 ? (
              <ChangePill
                label={t("指派 {{count}}", { count: data.assigneeCount })}
                color={theme.colors.accent}
                foreground={theme.colors.accentForeground}
              />
            ) : null}
            {data.updatedCount > 0 ? (
              <ChangePill
                label={t("更新 {{count}}", { count: data.updatedCount })}
                color={theme.colors.surface2}
                foreground={theme.colors.foregroundMuted}
              />
            ) : null}
          </Row>
          <Text style={textStyle(theme, 10, true)}>
            {data.intervalSeconds > 0
              ? t("每 {{interval}} 秒检查一次 · 每个状态最多 {{limit}} 条", {
                  interval: data.intervalSeconds,
                  limit: WORKITEMS_PER_STATUS,
                })
              : t("自动轮询已关闭，可在插件设置中开启")}
            {data.lastPollAt
              ? t(" · 上次检查 {{time}}", {
                  time: formatDateTime(data.lastPollAt),
                })
              : ""}
          </Text>
          {data.error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
              {data.error}
            </Text>
          ) : null}

          {data.items.length > 0 ? (
            <ScrollView style={{ maxHeight: 330 }} nestedScrollEnabled>
              <View style={{ gap: 7 }}>
                {data.items.map((item) => (
                  <ChangeRow
                    key={item.key}
                    item={item}
                    theme={theme}
                    onPress={() => void openBoard()}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={textStyle(theme, 12, true)}>
              {data.error ? "暂时无法读取变化" : "暂无未读变化"}
            </Text>
          )}
        </>
      ) : null}

      <Divider theme={theme} />
      <Row gap={8} wrap>
        <Button
          label="全部标记已读"
          theme={theme}
          compact
          disabled={!data || data.totalCount === 0}
          onPress={() => void markRead()}
        />
        <Button
          label="通知中心"
          icon="Bell"
          theme={theme}
          compact
          onPress={openNotifications}
        />
        <Button
          label="打开工单看板"
          icon="ArrowRight"
          theme={theme}
          compact
          onPress={() => void openBoard()}
        />
      </Row>
    </View>
  );
}

export function ChangePopover(props: PluginPopoverProps) {
  const settings = useSettings(autowonderSettings);
  const preference =
    settings.status === "ready" ? preferenceFromSettings(settings.values) : "auto";
  return (
    <I18nProvider preference={preference}>
      <ChangePopoverContent {...props} />
    </I18nProvider>
  );
}

function ChangeRow({
  item,
  theme,
  onPress,
}: {
  item: WorkitemChange;
  theme: PluginPopoverProps["theme"];
  onPress: () => void;
}) {
  const { t } = useI18n();
  const detail =
    item.changes.includes("status") && item.oldStatusName
      ? `${item.oldStatusName} → ${item.newStatusName ?? "—"}`
      : item.changes.includes("assignee") && item.oldAssignee
        ? `${item.oldAssignee} → ${item.newAssignee ?? "—"}`
        : item.changes.includes("updated")
          ? "标题或内容有更新"
          : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}，${item.changes.map(changeTagLabel).join("、")}`}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Row gap={5}>
        {item.changes.map((change) => (
          <ChangePill
            key={change}
            label={changeTagLabel(change)}
            color={
              change === "new"
                ? theme.colors.statusSuccess
                : change === "status"
                  ? theme.colors.statusWarning
                  : change === "assignee"
                    ? theme.colors.accent
                    : theme.colors.surface2
            }
            foreground={
              change === "updated" ? theme.colors.foregroundMuted : theme.colors.surface0
            }
          />
        ))}
        <Text style={{ ...textStyle(theme, 10, true), marginLeft: "auto" }}>
          {item.workspaceName || t("工作区 #{{id}}", { id: item.workspaceId })} · #{item.id}
        </Text>
      </Row>
      <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 12 }}>
        {item.title}
      </Text>
      {detail ? <Text style={textStyle(theme, 11, true)}>{detail}</Text> : null}
    </Pressable>
  );
}
