import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import {
  ackChangeRpc,
  ackChangesRpc,
  type WorkitemChange,
} from "../shared/contracts";
import { changesQueryKey, useChanges } from "./changes";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Loading,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import { errorMessage, formatDateTime } from "./lib";

function changeTone(
  change: WorkitemChange["changes"][number],
): "success" | "warning" | "accent" | "muted" {
  if (change === "new") return "success";
  if (change === "status") return "warning";
  if (change === "assignee") return "accent";
  return "muted";
}

function changeLabel(change: WorkitemChange["changes"][number]): string {
  if (change === "new") return "新增";
  if (change === "status") return "状态";
  if (change === "assignee") return "指派";
  return "更新";
}

function changeDetail(item: WorkitemChange): string {
  if (item.changes.includes("status") && item.oldStatusName) {
    return `${item.oldStatusName} → ${item.newStatusName ?? "—"}`;
  }
  if (item.changes.includes("assignee") && item.oldAssignee) {
    return `${item.oldAssignee} → ${item.newAssignee ?? "—"}`;
  }
  if (item.changes.includes("updated")) return "标题或内容有更新";
  return "";
}

export function NotificationCenter({
  theme,
  compact,
  onOpenWorkitem,
}: {
  theme: PluginTheme;
  compact: boolean;
  onOpenWorkitem: (workspaceId: number, workitemId: number) => void;
}) {
  const changes = useChanges();
  const ackAll = useRpc(ackChangesRpc);
  const ackOne = useRpc(ackChangeRpc);
  const queryClient = useQueryClient();
  const data = changes.data;
  const history = [...(data?.history ?? [])].sort(
    (left, right) =>
      Number(left.read) - Number(right.read) || right.revision - left.revision,
  );
  const unreadCount = data?.totalCount ?? 0;

  async function markAllRead() {
    try {
      const state = await ackAll({});
      queryClient.setQueryData(changesQueryKey, state);
    } catch {
      // The next poll keeps the state visible.
    }
  }

  async function markOneRead(key: string) {
    try {
      const state = await ackOne({ key });
      queryClient.setQueryData(changesQueryKey, state);
    } catch {
      // The next poll keeps the state visible.
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="通知中心"
        subtitle={`${unreadCount} 条未读 · 最近 ${history.length} 条变化`}
        theme={theme}
        trailing={
          <Button
            label="全部标记已读"
            theme={theme}
            compact
            icon="CheckCheck"
            disabled={unreadCount === 0}
            onPress={() => void markAllRead()}
          />
        }
      />

      {changes.isLoading ? <Loading theme={theme} label="读取通知…" /> : null}
      {changes.error ? (
        <ErrorBox
          error={errorMessage(changes.error)}
          theme={theme}
          onRetry={() => void changes.refetch()}
        />
      ) : null}
      {data?.error ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{data.error}</Text>
      ) : null}
      {!changes.isLoading && !changes.error && history.length === 0 ? (
        <Empty
          title="暂无通知"
          hint="工单新增、状态、指派或内容发生变化后，会出现在这里。"
          theme={theme}
        />
      ) : null}

      <View style={{ gap: 8 }}>
        {history.map((item) => (
          <Card key={item.key} theme={theme}>
            <Row gap={6}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: item.read
                    ? theme.colors.foregroundMuted
                    : theme.colors.accent,
                }}
              />
              {item.changes.map((change) => (
                <Badge
                  key={change}
                  label={changeLabel(change)}
                  tone={changeTone(change)}
                  theme={theme}
                />
              ))}
              <Text style={{ ...textStyle(theme, 10, true), marginLeft: "auto" }}>
                {formatDateTime(item.updatedAt)}
              </Text>
            </Row>
            <Text
              numberOfLines={compact ? 2 : 3}
              style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}
            >
              {item.title || `工单 #${item.id}`}
            </Text>
            <Text style={textStyle(theme, 11, true)}>
              {item.workspaceName || `工作区 #${item.workspaceId}`} · #{item.id}
              {item.workType ? ` · ${item.workType}` : ""}
              {item.statusName ? ` · ${item.statusName}` : ""}
            </Text>
            {changeDetail(item) ? (
              <Text style={textStyle(theme, 11, true)}>{changeDetail(item)}</Text>
            ) : null}
            <Row gap={7}>
              <Button
                label="打开工单"
                theme={theme}
                compact
                icon="ArrowRight"
                onPress={() => onOpenWorkitem(item.workspaceId, item.id)}
              />
              {!item.read ? (
                <Button
                  label="标记已读"
                  theme={theme}
                  compact
                  icon="Check"
                  onPress={() => void markOneRead(item.key)}
                />
              ) : (
                <Text style={textStyle(theme, 10, true)}>已读</Text>
              )}
            </Row>
          </Card>
        ))}
      </View>
    </View>
  );
}
