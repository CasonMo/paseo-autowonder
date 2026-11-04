import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { callToolRpc, type ToolDescriptor } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  Input,
  Loading,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import { ToolRunner } from "./ToolRunner";
import {
  DispatchInspectorModal,
  type DispatchInspectorTab,
} from "./DispatchInspector";
import {
  asNumber,
  asRecord,
  asString,
  formatDateTime,
  listItems,
} from "./lib";
import { useWorkspaceNameMaps } from "./workspace-names";
import { useI18n } from "./i18n";

const RANGES = [
  { hours: 24, label: "近 24 小时" },
  { hours: 24 * 7, label: "近 7 天" },
  { hours: 24 * 30, label: "近 30 天" },
  { hours: 24 * 90, label: "近 90 天" },
];

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const AUTO_REFRESH_MS = 30_000;
const LONG_RUNNING_MS = 30 * 60 * 1000;
const ACTIVE_STATUSES = new Set([
  "RUNNING",
  "STARTED",
  "PENDING",
  "IN_PROGRESS",
  "QUEUED",
]);

type StatusFilter = "all" | "active" | "failed" | "paused" | "succeeded" | "canceled";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "active", label: "活跃" },
  { id: "failed", label: "失败" },
  { id: "paused", label: "暂停" },
  { id: "succeeded", label: "成功" },
  { id: "canceled", label: "取消" },
];

function isActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status.toUpperCase());
}

function formatAge(
  milliseconds: number,
  t: (text: string, values?: Record<string, string | number | boolean>) => string,
): string {
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return t("{{minutes}} 分钟", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{{hours}} 小时", { hours });
  return t("{{days}} 天", { days: Math.floor(hours / 24) });
}

function Metric({
  label,
  value,
  tone,
  theme,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "danger" | "accent";
  theme: PluginTheme;
}) {
  const color =
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
    <View
      style={{
        minWidth: 88,
        paddingHorizontal: 11,
        paddingVertical: 9,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        gap: 3,
      }}
    >
      <Text style={{ color, fontSize: 18, fontWeight: "600" }}>{value}</Text>
      <Text style={textStyle(theme, 10, true)}>{label}</Text>
    </View>
  );
}

export function ExecutionsSection({
  workspaceId,
  theme,
  compact,
  tools,
  onOpenWorkitem,
}: {
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  tools: ToolDescriptor[];
  onOpenWorkitem?: (workitemId: number) => void;
}) {
  const call = useRpc(callToolRpc);
  const { t } = useI18n();
  const [rangeHours, setRangeHours] = useState(24 * 7);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [runner, setRunner] = useState<{
    tool: ToolDescriptor;
    preset: Record<string, unknown>;
  } | null>(null);
  const [inspector, setInspector] = useState<{
    mode: DispatchInspectorTab;
    dispatchId: number;
    workitemId?: number;
    status?: string;
  } | null>(null);
  const { agentNames } = useWorkspaceNameMaps(workspaceId);
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const window = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - rangeHours * 60 * 60 * 1000);
    return { createdFrom: from.toISOString(), createdTo: to.toISOString() };
  }, [rangeHours]);

  const query = useQuery({
    queryKey: ["aw", workspaceId, "executions", rangeHours],
    queryFn: async () => {
      const items: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      let truncated = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await call({
          name: "autowonder.list_workitem_executions",
          arguments: {
            workspaceId,
            ...window,
            size: PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          },
        });
        if (response.isError) {
          throw new Error(response.contentText ?? "执行记录加载失败");
        }
        items.push(...listItems(response.data));
        const nextCursor = asString(asRecord(response.data).nextCursor);
        if (!nextCursor) break;
        cursor = nextCursor;
        if (page === MAX_PAGES - 1) truncated = true;
      }
      return { items, truncated };
    },
    enabled: toolMap.has("autowonder.list_workitem_executions"),
    retry: 1,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
  });

  const items = query.data?.items ?? [];
  const summary = useMemo(() => {
    const counts = {
      total: items.length,
      active: 0,
      longRunning: 0,
      failed: 0,
      paused: 0,
      succeeded: 0,
      canceled: 0,
    };
    const now = Date.now();
    for (const item of items) {
      const status = asString(item.status).toUpperCase();
      if (isActive(status)) {
        counts.active += 1;
        const createdAt = Date.parse(asString(item.createdAt));
        if (Number.isFinite(createdAt) && now - createdAt > LONG_RUNNING_MS) {
          counts.longRunning += 1;
        }
      } else if (status === "FAILED") {
        counts.failed += 1;
      } else if (status === "PAUSED") {
        counts.paused += 1;
      } else if (status === "SUCCEEDED") {
        counts.succeeded += 1;
      } else if (status === "CANCELED") {
        counts.canceled += 1;
      }
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return items.filter((item) => {
      const status = asString(item.status).toUpperCase();
      if (statusFilter === "active" && !isActive(status)) return false;
      if (statusFilter === "failed" && status !== "FAILED") return false;
      if (statusFilter === "paused" && status !== "PAUSED") return false;
      if (statusFilter === "succeeded" && status !== "SUCCEEDED") return false;
      if (statusFilter === "canceled" && status !== "CANCELED") return false;
      if (!search) return true;
      const agentId = asNumber(item.agentId);
      const agentLabel =
        agentId !== undefined ? `${agentNames.get(agentId) ?? ""} ${agentId}` : "";
      return [asString(item.dispatchId), asString(item.workitemId), status, agentLabel]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [items, keyword, statusFilter, agentNames]);

  function openTool(name: string, preset: Record<string, unknown>) {
    const tool = toolMap.get(name);
    if (!tool) return;
    setRunner({ tool, preset: { workspaceId, ...preset } });
  }

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="执行监控"
        subtitle={`${t("{{start}} 至 {{end}}", {
          start: window.createdFrom.slice(0, 10),
          end: window.createdTo.slice(0, 10),
        })} · ${t("已加载 {{count}} 条", { count: items.length })}${
          query.data?.truncated
            ? t("（最多 500 条，缩小时间范围可查看更多）")
            : ""
        }`}
        theme={theme}
        trailing={
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            disabled={query.isFetching}
            onPress={() => void query.refetch()}
          />
        }
      />

      <Card theme={theme}>
        <Row gap={8} wrap>
          <Metric label="总数" value={summary.total} tone="default" theme={theme} />
          <Metric label="活跃" value={summary.active} tone="accent" theme={theme} />
          <Metric label="长尾 > 30 分钟" value={summary.longRunning} tone="warning" theme={theme} />
          <Metric label="失败" value={summary.failed} tone="danger" theme={theme} />
          <Metric label="暂停" value={summary.paused} tone="warning" theme={theme} />
          <Metric label="成功" value={summary.succeeded} tone="success" theme={theme} />
          <Metric label="取消" value={summary.canceled} tone="default" theme={theme} />
        </Row>
      </Card>

      <Row gap={6} wrap>
        {RANGES.map((range) => (
          <Chip
            key={range.hours}
            label={range.label}
            active={rangeHours === range.hours}
            theme={theme}
            onPress={() => setRangeHours(range.hours)}
          />
        ))}
        <Chip
          label={autoRefresh ? "自动刷新 30s" : "自动刷新关闭"}
          active={autoRefresh}
          theme={theme}
          onPress={() => setAutoRefresh((value) => !value)}
        />
      </Row>

      <Row gap={6} wrap>
        {STATUS_FILTERS.map((filter) => (
          <Chip
            key={filter.id}
            label={filter.label}
            active={statusFilter === filter.id}
            theme={theme}
            onPress={() => setStatusFilter(filter.id)}
          />
        ))}
      </Row>

      <Input
        value={keyword}
        onChangeText={setKeyword}
        placeholder="搜索派发 ID、工单 ID、数字员工…"
        theme={theme}
      />

      {query.isLoading ? <Loading theme={theme} label="读取执行记录…" /> : null}
      {query.error ? (
        <ErrorBox error={query.error} theme={theme} onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.error && filtered.length === 0 ? (
        <Empty
          title="暂无执行记录"
          hint={
            items.length > 0
              ? "调整状态筛选或搜索词。"
              : "该时间范围内没有工单派发。"
          }
          theme={theme}
        />
      ) : null}

      <View style={{ gap: 8 }}>
        {filtered.map((item) => {
          const dispatchId = asNumber(item.dispatchId);
          const workitemId = asNumber(item.workitemId);
          const agentId = asNumber(item.agentId);
          const status = asString(item.status);
          const active = isActive(status);
          const createdAt = Date.parse(asString(item.createdAt));
          const age = Number.isFinite(createdAt) ? Date.now() - createdAt : undefined;
          const longRunning = active && age !== undefined && age > LONG_RUNNING_MS;
          const agentLabel =
            agentId !== undefined
              ? `${agentNames.get(agentId) ?? t("数字员工")} #${agentId}`
              : "—";
          return (
            <Card
              key={String(dispatchId ?? `${workitemId}-${asString(item.createdAt)}`)}
              theme={theme}
            >
              <Row gap={8} wrap>
                <Badge label={status || "—"} theme={theme} />
                {longRunning ? <Badge label="长尾" theme={theme} tone="warning" /> : null}
                <Text style={{ color: theme.colors.foreground, fontSize: 13, flex: 1 }}>
                  {t("工单 #{{workitem}} · 派发 #{{dispatch}}", {
                    workitem: String(workitemId ?? "—"),
                    dispatch: String(dispatchId ?? "—"),
                  })}
                </Text>
                <Text style={textStyle(theme, 11, true)}>
                  {formatDateTime(item.createdAt)}
                </Text>
              </Row>
              <Row gap={8} wrap>
                <Text style={textStyle(theme, 11, true)}>
                  {t("数字员工：{{name}}", { name: agentLabel })}
                </Text>
                {active && age !== undefined ? (
                  <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
                    {t("已运行 {{age}}", { age: formatAge(age, t) })}
                  </Text>
                ) : null}
              </Row>
              <Row gap={6} wrap>
                <Button
                  label="工单"
                  theme={theme}
                  compact
                  icon="ArrowRight"
                  disabled={workitemId === undefined || !onOpenWorkitem}
                  onPress={() => {
                    if (workitemId !== undefined) onOpenWorkitem?.(workitemId);
                  }}
                />
                <Button
                  label="活动"
                  theme={theme}
                  compact
                  icon="Activity"
                  disabled={
                    !toolMap.has("autowonder.get_dispatch_activities") ||
                    dispatchId === undefined
                  }
                  onPress={() => {
                    if (dispatchId !== undefined) {
                      setInspector({
                        mode: "activities",
                        dispatchId,
                        workitemId,
                        status,
                      });
                    }
                  }}
                />
                <Button
                  label="轨迹"
                  theme={theme}
                  compact
                  icon="Route"
                  disabled={
                    !toolMap.has("autowonder.get_dispatch_runtime_trace") ||
                    dispatchId === undefined
                  }
                  onPress={() => {
                    if (dispatchId !== undefined) {
                      setInspector({
                        mode: "trace",
                        dispatchId,
                        workitemId,
                        status,
                      });
                    }
                  }}
                />
                <Button
                  label="诊断"
                  theme={theme}
                  compact
                  icon="Stethoscope"
                  disabled={
                    !toolMap.has("autowonder.get_dispatch_diagnostics") ||
                    dispatchId === undefined
                  }
                  onPress={() => {
                    if (dispatchId !== undefined) {
                      setInspector({
                        mode: "diagnostics",
                        dispatchId,
                        workitemId,
                        status,
                      });
                    }
                  }}
                />
                <Button
                  label="暂停"
                  theme={theme}
                  compact
                  icon="Pause"
                  disabled={
                    !toolMap.has("autowonder.pause_dispatch") || workitemId === undefined
                  }
                  onPress={() =>
                    openTool("autowonder.pause_dispatch", {
                      dispatchId,
                      workitemId,
                    })
                  }
                />
                <Button
                  label="恢复信息"
                  theme={theme}
                  compact
                  icon="RotateCcw"
                  disabled={
                    !toolMap.has("autowonder.get_delivery_recovery") ||
                    workitemId === undefined
                  }
                  onPress={() =>
                    openTool("autowonder.get_delivery_recovery", { workitemId })
                  }
                />
              </Row>
              {compact ? null : (
                <Text translate={false} style={textStyle(theme, 11, true)}>
                  {t("活动、轨迹与诊断以时间线和结构化视图展示，原始 JSON 可展开查看。")}
                </Text>
              )}
            </Card>
          );
        })}
      </View>

      {runner ? (
        <ToolRunner
          open
          tool={runner.tool}
          preset={runner.preset}
          theme={theme}
          onClose={() => setRunner(null)}
          onSuccess={() => void query.refetch()}
        />
      ) : null}

      {inspector ? (
        <DispatchInspectorModal
          open
          initialTab={inspector.mode}
          workspaceId={workspaceId}
          dispatchId={inspector.dispatchId}
          workitemId={inspector.workitemId}
          status={inspector.status}
          theme={theme}
          onClose={() => setInspector(null)}
        />
      ) : null}
    </View>
  );
}
