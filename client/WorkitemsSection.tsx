import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import {
  autowonderSettings,
  callToolRpc,
  WORKITEM_STATUS_CATEGORIES,
  WORKITEMS_PER_STATUS,
  type ToolDescriptor,
} from "../shared/contracts";
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
  asNumber,
  asString,
  formatDateTime,
  listItems,
  priorityLabel,
  statusCategoryLabel,
  withAssigneeLabel,
} from "./lib";

type MineTab = "all" | "pending" | "created" | "assigned" | "watched" | "commented";
type TypeFilter = "all" | "REQ" | "BUG" | "TASK";
type RiskFilter = "stuck" | "pending" | "failed" | "scheduled" | "stale";

const MINE_TABS: { id: MineTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待我决策" },
  { id: "created", label: "我创建的" },
  { id: "assigned", label: "指派给我的" },
  { id: "watched", label: "我关注的" },
  { id: "commented", label: "我参与的" },
];

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "全部类型" },
  { id: "REQ", label: "需求" },
  { id: "BUG", label: "缺陷" },
  { id: "TASK", label: "任务" },
];

const COLUMNS = [
  { category: "NEW", label: "待处理" },
  { category: "IN_PROGRESS", label: "执行中" },
  { category: "PENDING_DECISION", label: "待决策" },
  { category: "DONE", label: "已完成" },
] as const;

const RISK_DEFS: { id: RiskFilter; label: string }[] = [
  { id: "stuck", label: "停滞" },
  { id: "pending", label: "待决策" },
  { id: "failed", label: "执行失败" },
  { id: "scheduled", label: "计划未启动" },
  { id: "stale", label: "7 天未更新" },
];

function isStuck(item: Record<string, unknown>): boolean {
  const health = asString(item.health);
  return health !== "" && health !== "OK";
}

function isPendingDecision(item: Record<string, unknown>): boolean {
  return item.pendingDecision === true || asString(item.statusCategory) === "PENDING_DECISION";
}

function isExecutionFailed(item: Record<string, unknown>): boolean {
  return asString(item.executionStatus) === "FAILED";
}

function isScheduledNotStarted(item: Record<string, unknown>): boolean {
  const startAt = asString(item.scheduledStartAt);
  if (!startAt) return false;
  const category = asString(item.statusCategory);
  if (category === "DONE" || category === "CANCELED") return false;
  const startedAt = Date.parse(startAt);
  return (
    Number.isFinite(startedAt) &&
    startedAt < Date.now() &&
    asString(item.scheduledStartTriggeredAt) === ""
  );
}

function isStale(item: Record<string, unknown>): boolean {
  const category = asString(item.statusCategory);
  if (category === "DONE" || category === "CANCELED") return false;
  const modified = Date.parse(asString(item.gmtModified));
  return Number.isFinite(modified) && Date.now() - modified > 7 * 24 * 60 * 60 * 1000;
}

function matchesRisk(item: Record<string, unknown>, risk: RiskFilter): boolean {
  if (risk === "stuck") return isStuck(item);
  if (risk === "pending") return isPendingDecision(item);
  if (risk === "failed") return isExecutionFailed(item);
  if (risk === "scheduled") return isScheduledNotStarted(item);
  return isStale(item);
}

function priorityTone(value: unknown): "danger" | "warning" | "muted" | "accent" {
  const priority = asNumber(value);
  if (priority === 1) return "danger";
  if (priority === 2) return "warning";
  if (priority === 3) return "accent";
  return "muted";
}

function sourceLabel(item: Record<string, unknown>): string {
  const provider = asString(item.sourceProvider);
  if (provider) return provider.toUpperCase();
  const sourceType = asString(item.sourceType);
  if (sourceType === "NATIVE") return "原生";
  return sourceType;
}

function columnColor(
  category: string,
  theme: PluginTheme,
): string {
  if (category === "IN_PROGRESS") return theme.colors.accent;
  if (category === "PENDING_DECISION") return theme.colors.statusWarning;
  if (category === "DONE") return theme.colors.statusSuccess;
  if (category === "CANCELED") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}

interface StatusBadgePalette {
  text: string;
  background: string;
}

const STATUS_BADGE_COLORS: Record<"light" | "dark", Record<string, StatusBadgePalette>> = {
  dark: {
    NEW: { text: "#cbd5e1", background: "rgba(100, 116, 139, 0.22)" },
    IN_PROGRESS: { text: "#c4b5fd", background: "rgba(139, 92, 246, 0.24)" },
    PENDING_DECISION: { text: "#f0abfc", background: "rgba(217, 70, 239, 0.24)" },
    DONE: { text: "#5eead4", background: "rgba(20, 184, 166, 0.22)" },
    CANCELED: { text: "#d4d4d8", background: "rgba(113, 113, 122, 0.22)" },
  },
  light: {
    NEW: { text: "#475569", background: "rgba(100, 116, 139, 0.12)" },
    IN_PROGRESS: { text: "#6d28d9", background: "rgba(139, 92, 246, 0.12)" },
    PENDING_DECISION: { text: "#a21caf", background: "rgba(217, 70, 239, 0.12)" },
    DONE: { text: "#0f766e", background: "rgba(20, 184, 166, 0.12)" },
    CANCELED: { text: "#52525b", background: "rgba(113, 113, 122, 0.12)" },
  },
};

function surfaceLuminance(value: string): number | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((char) => char + char)
            .join("")
        : hex[1];
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value.trim());
  if (rgb) {
    return (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000;
  }
  return null;
}

function isDarkSurface(theme: PluginTheme): boolean {
  const luminance = surfaceLuminance(theme.colors.surface0);
  return luminance === null || luminance < 128;
}

function statusBadgeColors(category: string, theme: PluginTheme): StatusBadgePalette {
  const palette = STATUS_BADGE_COLORS[isDarkSurface(theme) ? "dark" : "light"];
  return (
    palette[category] ?? {
      text: theme.colors.foregroundMuted,
      background: theme.colors.surface2,
    }
  );
}

function StatusBadge({
  label,
  category,
  theme,
}: {
  label: string;
  category: string;
  theme: PluginTheme;
}) {
  const colors = statusBadgeColors(category, theme);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.background,
        alignSelf: "flex-start",
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text }} />
      <Text style={{ color: colors.text, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function isNewerItem(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): boolean {
  const nextVersion = asNumber(next.version) ?? -1;
  const previousVersion = asNumber(previous.version) ?? -1;
  if (nextVersion !== previousVersion) return nextVersion > previousVersion;
  return asString(next.gmtModified) > asString(previous.gmtModified);
}

export function WorkitemsSection({
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
  onOpenDetail: (item: Record<string, unknown>) => void;
}) {
  const call = useRpc(callToolRpc);
  const { t } = useI18n();
  const settings = useSettings(autowonderSettings);
  const queryClient = useQueryClient();
  const [mineTab, setMineTab] = useState<MineTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [contentWidth, setContentWidth] = useState(0);
  const [showCanceled, setShowCanceled] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskFilter | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [runner, setRunner] = useState<{
    tool: ToolDescriptor;
    preset: Record<string, unknown>;
  } | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const currentTypeFilter =
    TYPE_FILTERS.find((filter) => filter.id === typeFilter) ?? TYPE_FILTERS[0];

  const query = useQuery({
    queryKey: ["aw", workspaceId, "workitems-board", mineTab, typeFilter, keyword],
    queryFn: async () => {
      const args: Record<string, unknown> = { workspaceId, size: WORKITEMS_PER_STATUS };
      if (typeFilter !== "all") args.workType = typeFilter;
      if (keyword.trim()) args.keyword = keyword.trim();
      if (mineTab === "pending") args.pendingDecisionOnly = true;
      if (mineTab === "created") args.mineScope = "CREATED";
      if (mineTab === "assigned") args.mineScope = "ASSIGNED";
      if (mineTab === "watched") args.mineScope = "WATCHED";
      if (mineTab === "commented") args.mineScope = "COMMENTED";
      const responses = await Promise.all(
        WORKITEM_STATUS_CATEGORIES.map((statusCategory) =>
          call({
            name: "autowonder.list_workitems",
            arguments: { ...args, statusCategory },
          }),
        ),
      );
      const merged = new Map<string, Record<string, unknown>>();
      for (const response of responses) {
        if (response.isError) throw new Error(response.contentText ?? "工单加载失败");
        for (const item of listItems(response.data)) {
          const id = asString(item.id);
          if (!id) continue;
          const existing = merged.get(id);
          if (!existing || isNewerItem(item, existing)) merged.set(id, item);
        }
      }
      return { items: [...merged.values()] };
    },
    enabled: toolMap.has("autowonder.list_workitems"),
    retry: 1,
  });

  const items = useMemo(
    () => listItems(query.data).map(withAssigneeLabel),
    [query.data],
  );
  const riskEnabled =
    settings.status !== "ready" || settings.values.riskRadarEnabled;
  const riskCounts = useMemo(() => {
    const counts: Record<RiskFilter, number> = {
      stuck: 0,
      pending: 0,
      failed: 0,
      scheduled: 0,
      stale: 0,
    };
    for (const item of items) {
      for (const risk of RISK_DEFS) {
        if (matchesRisk(item, risk.id)) counts[risk.id] += 1;
      }
    }
    return counts;
  }, [items]);
  const visibleItems = useMemo(
    () => (riskFilter ? items.filter((item) => matchesRisk(item, riskFilter)) : items),
    [items, riskFilter],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const item of visibleItems) {
      const category = asString(item.statusCategory) || "NEW";
      const list = map.get(category) ?? [];
      list.push(item);
      map.set(category, list);
    }
    return map;
  }, [visibleItems]);
  const hasCategoryAtLimit = WORKITEM_STATUS_CATEGORIES.some(
    (category) => (grouped.get(category)?.length ?? 0) >= WORKITEMS_PER_STATUS,
  );
  const hasCanceledColumn = showCanceled && (grouped.get("CANCELED")?.length ?? 0) > 0;
  const columnCount = COLUMNS.length + (hasCanceledColumn ? 1 : 0);
  const columnWidth = compact
    ? 272
    : contentWidth > 0
      ? Math.max(240, Math.floor((contentWidth - (columnCount - 1) * 12) / columnCount))
      : 280;
  const columnHeight = Math.max(
    compact ? 420 : 460,
    windowHeight - (compact ? 380 : 390),
  );

  function openCreate() {
    const tool = toolMap.get("autowonder.create_workitem");
    if (!tool) return;
    setRunner({ tool, preset: { workspaceId } });
  }

  return (
    <View style={{ gap: 14 }} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}>
      <SectionHeader
        title="工单"
        subtitle={`${t("已加载 {{count}} 条", { count: visibleItems.length })} · ${t(
          "每个状态最多 {{limit}} 条",
          { limit: WORKITEMS_PER_STATUS },
        )}${hasCategoryAtLimit ? t("，可搜索缩小范围") : ""}`}
        theme={theme}
        trailing={
          <Row gap={6}>
            <Button
              label="新建工单"
              theme={theme}
              tone="primary"
              compact
              icon="Plus"
              disabled={!toolMap.has("autowonder.create_workitem")}
              onPress={openCreate}
            />
            <Button
              label="刷新"
              theme={theme}
              compact
              icon="RefreshCw"
              onPress={() => void queryClient.invalidateQueries({ queryKey: ["aw"] })}
            />
          </Row>
        }
      />

      {riskEnabled ? (
        <Card theme={theme}>
          <Row gap={8}>
            <Text style={textStyle(theme, 12, true)}>风险雷达</Text>
            <Text translate={false} style={textStyle(theme, 10, true)}>
              {t("基于当前已加载工单，点选可筛选")}
            </Text>
            {riskFilter ? (
              <Button
                label="清除"
                theme={theme}
                compact
                icon="X"
                onPress={() => setRiskFilter(null)}
              />
            ) : null}
          </Row>
          <Row gap={6} wrap>
            {RISK_DEFS.map((risk) => (
              <Chip
                key={risk.id}
                label={`${t(risk.label)} ${riskCounts[risk.id]}`}
                active={riskFilter === risk.id}
                disabled={riskCounts[risk.id] === 0 && riskFilter !== risk.id}
                onPress={() =>
                  setRiskFilter((current) => (current === risk.id ? null : risk.id))
                }
                theme={theme}
              />
            ))}
          </Row>
        </Card>
      ) : null}

      <View style={{ position: "relative", zIndex: typeMenuOpen ? 20 : 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("工单类型：{{label}}", {
                label: currentTypeFilter.label,
              })}
              accessibilityState={{ expanded: typeMenuOpen }}
              onPress={() => setTypeMenuOpen((value) => !value)}
              style={({ pressed }) => ({
                minHeight: 32,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: typeMenuOpen ? theme.colors.accent : theme.colors.border,
                backgroundColor: typeMenuOpen ? theme.colors.surface2 : theme.colors.surface1,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                {currentTypeFilter.label}
              </Text>
              <Icon
                name={typeMenuOpen ? "ChevronUp" : "ChevronDown"}
                size={13}
                color={theme.colors.foregroundMuted}
              />
            </Pressable>
            {MINE_TABS.map((tab) => (
              <Chip
                key={tab.id}
                label={tab.label}
                active={mineTab === tab.id}
                theme={theme}
                onPress={() => {
                  setTypeMenuOpen(false);
                  setMineTab(tab.id);
                }}
              />
            ))}
            <View style={{ width: compact ? 190 : 230 }}>
              <Input
                value={keyword}
                onChangeText={setKeyword}
                placeholder="搜索工单 ID 或标题…"
                theme={theme}
              />
            </View>
            <Chip
              label="显示已取消"
              active={showCanceled}
              theme={theme}
              onPress={() => setShowCanceled((value) => !value)}
            />
          </View>
        </ScrollView>

        {typeMenuOpen ? (
          <View
            style={{
              position: "absolute",
              top: 38,
              left: 0,
              zIndex: 50,
              width: 156,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 9,
              backgroundColor: theme.colors.surface1,
              padding: 5,
              gap: 2,
              shadowColor: "#000000",
              shadowOpacity: 0.16,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 8,
            }}
          >
            {TYPE_FILTERS.map((filter) => {
              const selected = typeFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setTypeFilter(filter.id);
                    setTypeMenuOpen(false);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 32,
                    paddingHorizontal: 9,
                    borderRadius: 6,
                    backgroundColor:
                      selected || pressed ? theme.colors.surface2 : "transparent",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  })}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.accent : theme.colors.foreground,
                      fontSize: 12,
                      flex: 1,
                    }}
                  >
                    {filter.label}
                  </Text>
                  {selected ? (
                    <Icon name="Check" size={13} color={theme.colors.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {query.isLoading ? <Loading theme={theme} label="读取工单看板…" /> : null}
      {query.error ? (
        <ErrorBox error={query.error} theme={theme} onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.error && visibleItems.length === 0 ? (
        <Empty
          title="暂无工单"
          hint={riskFilter ? "当前风险筛选没有工单。" : "切换筛选条件或新建一张工单。"}
          theme={theme}
        />
      ) : null}

      {visibleItems.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            {COLUMNS.map((column) => {
              const columnItems = grouped.get(column.category) ?? [];
              const accent = columnColor(column.category, theme);
              return (
                <View
                  key={column.category}
                  style={{
                    width: columnWidth,
                    height: columnHeight,
                    overflow: "hidden",
                    borderRadius: 10,
                    backgroundColor: theme.colors.surface1,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderTopWidth: 2,
                    borderTopColor: accent,
                    padding: 10,
                    gap: 9,
                  }}
                >
                  <Row gap={7}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
                    <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
                      {column.label}
                    </Text>
                    <Badge
                      label={String(columnItems.length)}
                      theme={theme}
                      tone={
                        column.category === "DONE"
                          ? "success"
                          : column.category === "PENDING_DECISION"
                            ? "warning"
                            : column.category === "IN_PROGRESS"
                              ? "accent"
                              : "muted"
                      }
                    />
                  </Row>
                  {columnItems.length === 0 ? (
                    <View
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={textStyle(theme, 11, true)}>暂无工单</Text>
                    </View>
                  ) : null}
                  {columnItems.length > 0 ? (
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {columnItems.map((item) => {
                    const id = asNumber(item.id);
                    const type = asString(item.workType);
                    const priority = priorityLabel(item.priority);
                    const statusName = asString(item.statusName);
                    const assignee = asString(item.assigneeLabel) || t("未指派");
                    const assigneeInitial = assignee.replace(/[（(].*$/, "").trim().slice(0, 1) || "?";
                    return (
                      <Pressable
                        key={String(id)}
                        accessibilityRole="button"
                        accessibilityLabel={asString(item.title)}
                        onPress={() => onOpenDetail(item)}
                        style={({ pressed }) => ({
                          backgroundColor: theme.colors.surface0,
                          borderWidth: 1,
                          borderColor: pressed ? theme.colors.accent : theme.colors.border,
                          borderRadius: 8,
                          padding: 11,
                          gap: 8,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Row gap={6}>
                          <Badge
                            label={type === "REQ" ? "需求" : type === "BUG" ? "缺陷" : "任务"}
                            theme={theme}
                            tone={type === "BUG" ? "danger" : type === "REQ" ? "accent" : "muted"}
                          />
                          {priority ? (
                            <Badge label={priority} theme={theme} tone={priorityTone(item.priority)} />
                          ) : null}
                          {statusName ? (
                            <StatusBadge
                              label={statusName}
                              category={asString(item.statusCategory)}
                              theme={theme}
                            />
                          ) : null}
                          <Text
                            translate={false}
                            style={{ ...textStyle(theme, 11, true), marginLeft: "auto" }}
                          >
                            {[t(sourceLabel(item)), `#${String(id ?? "")}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </Row>
                        <Text
                          numberOfLines={3}
                          translate={false}
                          style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 19 }}
                        >
                          {asString(item.title)}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              backgroundColor: theme.colors.surface2,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
                              {assigneeInitial}
                            </Text>
                          </View>
                          <Text
                            numberOfLines={1}
                            translate={false}
                            style={{ ...textStyle(theme, 11, true), flex: 1 }}
                          >
                            {assignee}
                          </Text>
                          <Text style={textStyle(theme, 11, true)}>
                            {formatDateTime(item.gmtModified)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                      })}
                    </ScrollView>
                  ) : null}
                </View>
              );
            })}
            {hasCanceledColumn ? (
              <View
                style={{
                  width: columnWidth,
                  height: columnHeight,
                  overflow: "hidden",
                  borderRadius: 10,
                  backgroundColor: theme.colors.surface1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderTopWidth: 2,
                  borderTopColor: theme.colors.statusDanger,
                  padding: 10,
                  gap: 9,
                }}
              >
                <Row gap={7}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: theme.colors.statusDanger,
                    }}
                  />
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
                    {statusCategoryLabel("CANCELED")}
                  </Text>
                  <Badge label={String(grouped.get("CANCELED")?.length ?? 0)} theme={theme} tone="danger" />
                </Row>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                {(grouped.get("CANCELED") ?? []).map((item) => (
                  <Pressable
                    key={String(item.id)}
                    onPress={() => onOpenDetail(item)}
                    style={{
                      backgroundColor: theme.colors.surface0,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 8,
                      padding: 10,
                      gap: 4,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      translate={false}
                      style={{ color: theme.colors.foreground, fontSize: 12 }}
                    >
                      {asString(item.title)}
                    </Text>
                    {asString(item.statusName) ? (
                      <StatusBadge
                        label={asString(item.statusName)}
                        category="CANCELED"
                        theme={theme}
                      />
                    ) : null}
                  </Pressable>
                ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      <Text translate={false} style={textStyle(theme, 10, true)}>
        {t(
          "每个状态最多展示 {{limit}} 条工单（按工单 ID 倒序）；更早的工单不会出现在看板或变化提示中。",
          { limit: WORKITEMS_PER_STATUS },
        )}
      </Text>

      {runner ? (
        <ToolRunner
          open
          tool={runner.tool}
          preset={runner.preset}
          theme={theme}
          onClose={() => setRunner(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["aw"] });
          }}
        />
      ) : null}
    </View>
  );
}
