import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Loading,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import { asString, listItems, statusCategoryLabel } from "./lib";
import { useI18n } from "./i18n";

interface OverviewData {
  workitems: Record<string, unknown>[];
  agents: Record<string, unknown>[];
  sdlcs: Record<string, unknown>[];
  squads: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  executors: Record<string, unknown>[];
}

function countByCategory(items: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const category = asString(item.statusCategory) || "UNKNOWN";
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function StatCard({
  label,
  value,
  hint,
  tone,
  theme,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning" | "danger" | "accent" | "muted";
  theme: PluginTheme;
  onPress?: () => void;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const toneColor =
    tone === "success"
      ? theme.colors.statusSuccess
      : tone === "warning"
        ? theme.colors.statusWarning
        : tone === "danger"
          ? theme.colors.statusDanger
          : tone === "accent"
            ? theme.colors.accent
            : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? t("查看{{label}}", { label }) : undefined}
      disabled={!onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 158,
        minWidth: 150,
        maxWidth: 280,
        minHeight: 96,
        justifyContent: "space-between",
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: pressed || focused ? theme.colors.accent : theme.colors.border,
        borderRadius: 10,
        padding: 14,
        gap: 8,
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: tone ? toneColor : theme.colors.foregroundMuted,
            }}
          />
          <Text style={{ ...textStyle(theme, 12, true), flex: 1 }}>{label}</Text>
          {onPress ? (
            <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
          ) : null}
        </View>
        <Text style={{ color: tone ? toneColor : theme.colors.foreground, fontSize: 26, fontWeight: "600" }}>
          {value}
        </Text>
        {hint ? <Text style={textStyle(theme, 11, true)}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Overview({
  workspaceId,
  theme,
  compact,
  onNavigate,
}: {
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  onNavigate: (section: string) => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const query = useQuery({
    queryKey: ["aw", workspaceId, "overview"],
    queryFn: async (): Promise<OverviewData> => {
      const [workitems, agents, sdlcs, squads, tasks, executors] = await Promise.all([
        call({
          name: "autowonder.list_workitems",
          arguments: { workspaceId, size: 100 },
        }),
        call({ name: "autowonder.list_agents", arguments: { workspaceId, size: 100 } }),
        call({ name: "autowonder.list_sdlcs", arguments: { workspaceId, size: 100 } }),
        call({ name: "autowonder.list_squads", arguments: { workspaceId, size: 100 } }),
        call({
          name: "autowonder.list_scheduled_tasks",
          arguments: { workspaceId, size: 100 },
        }),
        call({ name: "autowonder.list_executors", arguments: { workspaceId } }),
      ]);
      for (const response of [workitems, agents, sdlcs, squads, tasks, executors]) {
        if (response.isError) {
          throw new Error(response.contentText ?? "概览数据加载失败");
        }
      }
      return {
        workitems: listItems(workitems.data),
        agents: listItems(agents.data),
        sdlcs: listItems(sdlcs.data),
        squads: listItems(squads.data),
        tasks: listItems(tasks.data, "list"),
        executors: listItems(executors.data),
      };
    },
    retry: 1,
  });

  const stats = useMemo(() => {
    if (!query.data) return null;
    const categories = countByCategory(query.data.workitems);
    const onlineAgents = query.data.agents.filter((agent) => asString(agent.status) === "ONLINE").length;
    const enabledSdls = query.data.sdlcs.filter((sdlc) => asString(sdlc.status) === "ENABLED").length;
    const activeTasks = query.data.tasks.filter((task) => asString(task.status) === "ACTIVE").length;
    const onlineExecutors = query.data.executors.filter(
      (executor) => asString(executor.status) === "ONLINE",
    ).length;
    return {
      categories,
      onlineAgents,
      enabledSdls,
      activeTasks,
      onlineExecutors,
    };
  }, [query.data]);

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="工作区概览"
        subtitle={
          query.data
            ? t(
                "统计最近拉取的 {{workitems}} 条工单、{{agents}} 个数字员工、{{executors}} 个执行器",
                {
                  workitems: query.data.workitems.length,
                  agents: query.data.agents.length,
                  executors: query.data.executors.length,
                },
              )
            : t("读取工作区状态…")
        }
        theme={theme}
        trailing={
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            onPress={() => void query.refetch()}
          />
        }
      />
      {query.isLoading ? <Loading theme={theme} label="汇总工作区数据…" /> : null}
      {query.error ? (
        <ErrorBox error={query.error} theme={theme} onRetry={() => void query.refetch()} />
      ) : null}

      {stats ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(["NEW", "IN_PROGRESS", "PENDING_DECISION", "DONE"] as const).map((category) => (
              <StatCard
                key={category}
                label={statusCategoryLabel(category)}
                value={String(stats.categories[category] ?? 0)}
                hint="工单"
                tone={
                  category === "DONE"
                    ? "success"
                    : category === "PENDING_DECISION"
                      ? "warning"
                      : category === "IN_PROGRESS"
                        ? "accent"
                        : "muted"
                }
                theme={theme}
                onPress={() => onNavigate("workitems")}
              />
            ))}
            <StatCard
              label="数字员工在线"
              value={`${stats.onlineAgents}/${query.data?.agents.length ?? 0}`}
              hint="在线 / 总数"
              tone="success"
              theme={theme}
              onPress={() => onNavigate("agents")}
            />
            <StatCard
              label="启用中的 SDLC"
              value={`${stats.enabledSdls}/${query.data?.sdlcs.length ?? 0}`}
              hint="启用 / 总数"
              tone="accent"
              theme={theme}
              onPress={() => onNavigate("sdlcs")}
            />
            <StatCard
              label="小队"
              value={String(query.data?.squads.length ?? 0)}
              tone="muted"
              theme={theme}
              onPress={() => onNavigate("squads")}
            />
            <StatCard
              label="运行中的定时任务"
              value={`${stats.activeTasks}/${query.data?.tasks.length ?? 0}`}
              hint="活跃 / 前 100 条"
              tone="warning"
              theme={theme}
              onPress={() => onNavigate("scheduled-tasks")}
            />
            <StatCard
              label="执行器在线"
              value={`${stats.onlineExecutors}/${query.data?.executors.length ?? 0}`}
              hint="在线 / 总数"
              tone="success"
              theme={theme}
              onPress={() => onNavigate("executors")}
            />
          </View>

          <Card theme={theme}>
            <Text style={textStyle(theme, 12, true)}>最近更新的工单</Text>
            <View style={{ gap: 6 }}>
              {query.data?.workitems
                .slice()
                .sort((a, b) => String(b.gmtModified ?? "").localeCompare(String(a.gmtModified ?? "")))
                .slice(0, compact ? 4 : 6)
                .map((item) => (
                  <Row key={asString(item.id)} gap={8}>
                    <Badge label={asString(item.statusName) || "—"} theme={theme} />
                    <Text
                      numberOfLines={1}
                      translate={false}
                      style={{ ...textStyle(theme, 12), flex: 1 }}
                    >
                      #{asString(item.id)} {asString(item.title)}
                    </Text>
                  </Row>
                ))}
            </View>
            <Button
              label="打开工单列表"
              theme={theme}
              compact
              icon="ArrowRight"
              onPress={() => onNavigate("workitems")}
            />
          </Card>
        </>
      ) : null}
    </View>
  );
}
