import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { WideModal } from "./WideModal";
import {
  autowonderSettings,
  callToolRpc,
  listToolsRpc,
  type ToolDescriptor,
} from "../shared/contracts";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Row,
  textStyle,
} from "./components";
import { AllTools } from "./AllTools";
import { ExecutionsSection } from "./ExecutionsSection";
import { ExecutorSection } from "./ExecutorSection";
import { MemorySection } from "./MemorySection";
import { NotificationCenter } from "./NotificationCenter";
import { ScheduledTaskSection } from "./ScheduledTaskSection";
import { Overview } from "./Overview";
import {
  EntityDetailModal,
  ResourceSection,
  type ResourceDef,
} from "./ResourceSection";
import { SettingsPanel } from "./SettingsScreen";
import { StatusTemplatesSection } from "./StatusTemplatesSection";
import { WorkitemsSection } from "./WorkitemsSection";
import { ToolRunner } from "./ToolRunner";
import { allResources, workitemResource } from "./resources";
import {
  asNumber,
  asRecord,
  asString,
  displayStatus,
  errorMessage,
  listItems,
  withAssigneeLabel,
} from "./lib";
import { AutoWonderMark } from "./icons";

const NAV_GROUPS: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: "交付",
    items: [
      { id: "overview", label: "总览" },
      { id: "workitems", label: "工单" },
      { id: "notifications", label: "通知中心" },
      { id: "scheduled-tasks", label: "定时任务" },
      { id: "executions", label: "执行监控" },
    ],
  },
  {
    title: "数字员工",
    items: [
      { id: "agents", label: "管理" },
      { id: "executors", label: "执行器" },
      { id: "squads", label: "小队" },
    ],
  },
  {
    title: "知识",
    items: [
      { id: "repos", label: "仓库" },
      { id: "memories", label: "记忆" },
      { id: "skills", label: "能力" },
      { id: "categories", label: "能力分类" },
    ],
  },
  {
    title: "配置",
    items: [
      { id: "sdlcs", label: "SDLC 流程" },
      { id: "status-templates", label: "状态模版" },
    ],
  },
  {
    title: "工具",
    items: [{ id: "tools", label: "全部工具" }],
  },
];

const NAV = NAV_GROUPS.flatMap((group) => group.items);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "MCP";
  }
}

export function BoardScreen({ theme, layout, params }: PluginScreenProps) {
  const { t } = useI18n();
  const settings = useSettings(autowonderSettings);
  const call = useRpc(callToolRpc);
  const listTools = useRpc(listToolsRpc);
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState("workitems");
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceTriggerFocused, setWorkspaceTriggerFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detail, setDetail] = useState<{
    resource: ResourceDef;
    item: Record<string, unknown>;
    decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>;
  } | null>(null);
  const [detailRunner, setDetailRunner] = useState<{
    tool: ToolDescriptor;
    preset: Record<string, unknown>;
  } | null>(null);
  const compact = layout.compact;

  useEffect(() => {
    const section = params?.section;
    if (section && NAV.some((item) => item.id === section)) {
      setActive(section);
    }
  }, [params?.section]);

  const mcpUrl = settings.status === "ready" ? settings.values.mcpUrl.trim() : "";
  const enabled = settings.status === "ready" && mcpUrl.length > 0;

  const projectsQuery = useQuery({
    queryKey: ["aw", "projects", mcpUrl],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_projects",
        arguments: {},
      });
      if (response.isError) throw new Error(response.contentText ?? "工作区加载失败");
      return response.data;
    },
    enabled,
    retry: 1,
  });

  const toolsQuery = useQuery({
    queryKey: ["aw", "tools", mcpUrl],
    queryFn: () => listTools({}),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const projects = useMemo(() => listItems(projectsQuery.data), [projectsQuery.data]);
  const tools: ToolDescriptor[] = toolsQuery.data?.tools ?? [];

  useEffect(() => {
    if (projects.length === 0) return;
    if (workspaceId !== null && projects.some((project) => asNumber(project.id) === workspaceId)) {
      return;
    }
    setWorkspaceId(asNumber(projects[0].id) ?? null);
  }, [projects, workspaceId]);

  const currentProject = projects.find((project) => asNumber(project.id) === workspaceId);
  const serverLabel = [
    toolsQuery.data?.serverName,
    toolsQuery.data?.serverVersion,
  ]
    .filter(Boolean)
    .join(" ");

  function refreshAll() {
    setWorkspaceMenuOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["aw"] });
  }

  function navigate(section: string) {
    setWorkspaceMenuOpen(false);
    setDetail(null);
    setActive(section);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function openDetail(
    item: Record<string, unknown>,
    resource: ResourceDef,
    decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>,
  ) {
    setDetail({ resource, item, decorateItem });
  }

  async function openWorkitemById(targetWorkspaceId: number, workitemId: number) {
    try {
      const response = await call({
        name: "autowonder.get_workitem",
        arguments: { workspaceId: targetWorkspaceId, id: workitemId },
      });
      if (response.isError) return;
      setWorkspaceId(targetWorkspaceId);
      setActive("workitems");
      openDetail(
        withAssigneeLabel(asRecord(response.data)),
        workitemResource,
      );
    } catch {
      // Keep the current screen when the workitem is no longer readable.
    }
  }

  if (settings.status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0, justifyContent: "center" }}>
        <Loading theme={theme} label="读取 AutoWonder 配置…" />
      </View>
    );
  }

  if (settings.status === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 20 }}>
        <ErrorBox error={settings.error} theme={theme} onRetry={() => void settings.reload()} />
      </View>
    );
  }

  if (settings.status === "invalid") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 20 }}>
        <SettingsPanel theme={theme} compact={compact} />
      </View>
    );
  }

  if (!mcpUrl) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
        contentContainerStyle={{ padding: compact ? 16 : 24 }}
      >
        <SettingsPanel theme={theme} compact={compact} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0, position: "relative" }}>
      {workspaceMenuOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("关闭工作空间菜单")}
          onPress={() => setWorkspaceMenuOpen(false)}
          style={{
            position: "absolute",
            top: 0,
            left: compact ? 0 : 164,
            right: 0,
            bottom: 0,
            zIndex: 30,
          }}
        />
      ) : null}

      <View
        style={{
          paddingHorizontal: compact ? 14 : 20,
          paddingTop: compact ? 12 : 16,
          paddingBottom: 10,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          zIndex: 40,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 6 : 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
            <AutoWonderMark size={compact ? 24 : 34} color={theme.colors.accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.foreground,
                  fontSize: compact ? 16 : 21,
                  fontWeight: "600",
                }}
              >
                AutoWonder
              </Text>
              <Text numberOfLines={1} translate={false} style={textStyle(theme, 12, true)}>
                {t("工作台 · {{server}} · {{count}} 个工具 · {{host}}", {
                  server: serverLabel || "MCP",
                  count: tools.length,
                  host: hostOf(mcpUrl),
                })}
              </Text>
            </View>
          </View>

          {compact ? (
          <View style={{ position: "relative", zIndex: 50 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("切换工作空间")}
              accessibilityState={{ expanded: workspaceMenuOpen }}
              disabled={projects.length === 0}
              hitSlop={6}
              onFocus={() => setWorkspaceTriggerFocused(true)}
              onBlur={() => setWorkspaceTriggerFocused(false)}
              onPress={() => setWorkspaceMenuOpen((value) => !value)}
              style={({ pressed }) => ({
                maxWidth: compact ? 148 : 240,
                height: 32,
                paddingHorizontal: compact ? 8 : 10,
                paddingVertical: 0,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  workspaceMenuOpen || workspaceTriggerFocused
                    ? theme.colors.accent
                    : theme.colors.border,
                backgroundColor: theme.colors.surface1,
                flexDirection: "row",
                alignItems: "center",
                gap: compact ? 5 : 7,
                opacity: pressed || projects.length === 0 ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  flexShrink: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text
                  numberOfLines={1}
                  translate={false}
                  style={{
                    color: theme.colors.foreground,
                    fontSize: 12,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {currentProject
                    ? asString(currentProject.name)
                    : t("工作空间")}
                </Text>
                {currentProject ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor:
                          asString(currentProject.accessLevel) === "ADMIN"
                            ? theme.colors.statusSuccess
                            : asString(currentProject.accessLevel) === "READ_WRITE"
                              ? theme.colors.accent
                              : theme.colors.foregroundMuted,
                      }}
                    />
                    <Text numberOfLines={1} style={textStyle(theme, 11, true)}>
                      {displayStatus(asString(currentProject.accessLevel))}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Icon
                name={workspaceMenuOpen ? "ChevronUp" : "ChevronDown"}
                size={13}
                color={theme.colors.foregroundMuted}
              />
            </Pressable>

            {workspaceMenuOpen ? (
              <View
                style={{
                  position: "absolute",
                  top: 38,
                  right: 0,
                  width: compact ? 236 : 280,
                  maxHeight: 340,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface1,
                  paddingVertical: 6,
                  shadowColor: "#000000",
                  shadowOpacity: 0.18,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 8,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.foregroundMuted,
                    fontSize: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  切换工作空间
                </Text>
                <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                  {projects.map((project) => {
                    const id = asNumber(project.id);
                    if (id === undefined) return null;
                    const selected = id === workspaceId;
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityLabel={asString(project.name)}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setWorkspaceId(id);
                          setWorkspaceMenuOpen(false);
                          setDetail(null);
                        }}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          gap: 3,
                          backgroundColor: selected
                            ? theme.colors.surface2
                            : pressed
                              ? theme.colors.surface2
                              : "transparent",
                        })}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text
                            numberOfLines={1}
                            translate={false}
                            style={{
                              color: theme.colors.foreground,
                              fontSize: 13,
                              fontWeight: selected ? "600" : "400",
                              flex: 1,
                            }}
                          >
                            {asString(project.name)}
                          </Text>
                          {selected ? (
                            <Icon name="Check" size={14} color={theme.colors.accent} />
                          ) : null}
                        </View>
                        <Text
                          numberOfLines={1}
                          translate={false}
                          style={textStyle(theme, 11, true)}
                        >
                          {t(displayStatus(asString(project.accessLevel)))}
                          {asString(project.description)
                            ? ` · ${asString(project.description)}`
                            : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
          ) : null}

          <Button
            label="设置"
            theme={theme}
            compact
            icon="Settings"
            iconOnly={compact}
            onPress={() => {
              setWorkspaceMenuOpen(false);
              setSettingsOpen(true);
            }}
          />
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            iconOnly={compact}
            onPress={refreshAll}
          />
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: compact ? "column" : "row" }}>
        {compact ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              flexGrow: 0,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
          >
            {NAV.map((item) => (
              <NavChip
                key={item.id}
                label={item.label}
                active={active === item.id}
                theme={theme}
                onPress={() => navigate(item.id)}
              />
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              width: 164,
              flexGrow: 0,
              flexShrink: 0,
              zIndex: workspaceMenuOpen ? 50 : 0,
              borderRightWidth: 1,
              borderRightColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <View
              style={{
                paddingHorizontal: 9,
                paddingTop: 9,
                paddingBottom: 7,
                zIndex: workspaceMenuOpen ? 60 : 0,
              }}
            >
              <WorkspaceSwitcher
                projects={projects}
                currentProject={currentProject}
                workspaceId={workspaceId}
                theme={theme}
                compact={false}
                open={workspaceMenuOpen}
                onOpenChange={setWorkspaceMenuOpen}
                onSelect={(id) => {
                  setWorkspaceId(id);
                  setWorkspaceMenuOpen(false);
                  setDetail(null);
                }}
              />
            </View>
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 9, gap: 3 }}>
              {NAV_GROUPS.map((group, groupIndex) => (
                <View key={group.title} style={{ gap: 3, marginTop: groupIndex === 0 ? 0 : 10 }}>
                  <Text
                    style={{
                      color: theme.colors.foregroundMuted,
                      fontSize: 10,
                      paddingHorizontal: 11,
                      paddingVertical: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {group.title}
                  </Text>
                  {group.items.map((item) => (
                    <NavRow
                      key={item.id}
                      label={item.label}
                      active={active === item.id}
                      theme={theme}
                      onPress={() => navigate(item.id)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{
            padding: compact ? 14 : 22,
            paddingBottom: compact ? 32 : 48,
          }}
        >
          {projectsQuery.isLoading ? <Loading theme={theme} label="读取工作区…" /> : null}
          {projectsQuery.error ? (
            <ErrorBox
              error={projectsQuery.error}
              theme={theme}
              onRetry={() => void projectsQuery.refetch()}
            />
          ) : null}
          {toolsQuery.error ? (
            <ErrorBox
              error={t("工具清单加载失败：{{error}}", {
                error: errorMessage(toolsQuery.error),
              })}
              theme={theme}
              onRetry={() => void toolsQuery.refetch()}
            />
          ) : null}

          {!projectsQuery.isLoading && !projectsQuery.error && projects.length === 0 ? (
            <Empty
              title="当前 MCP 没有可访问的工作区"
              hint="请确认 MCP URL 对应的账号拥有 AutoWonder 工作区权限。"
              theme={theme}
              action={
                <Button label="打开设置" theme={theme} onPress={() => setSettingsOpen(true)} />
              }
            />
          ) : null}

          {workspaceId !== null ? (
            <>
              {active === "overview" ? (
                <Overview
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  onNavigate={navigate}
                />
              ) : null}
              {active === "workitems" ? (
                <WorkitemsSection
                  key={workspaceId}
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  tools={tools}
                  onOpenDetail={(item) =>
                    openDetail(item, workitemResource, withAssigneeLabel)
                  }
                />
              ) : null}
              {active === "notifications" ? (
                <NotificationCenter
                  theme={theme}
                  compact={compact}
                  onOpenWorkitem={(targetWorkspaceId, workitemId) => {
                    void openWorkitemById(targetWorkspaceId, workitemId);
                  }}
                />
              ) : null}
              {active === "executions" ? (
                <ExecutionsSection
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  tools={tools}
                  onOpenWorkitem={(workitemId) => {
                    void openWorkitemById(workspaceId, workitemId);
                  }}
                />
              ) : null}
              {active === "status-templates" ? (
                <StatusTemplatesSection
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                />
              ) : null}
              {active === "tools" ? (
                <AllTools
                  workspaceId={workspaceId}
                  tools={tools}
                  theme={theme}
                  compact={compact}
                />
              ) : null}
              {active === "memories" ? (
                <MemorySection
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  tools={tools}
                  onOpenDetail={openDetail}
                />
              ) : null}
              {active === "scheduled-tasks" ? (
                <ScheduledTaskSection
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  tools={tools}
                  onOpenDetail={openDetail}
                />
              ) : null}
              {active === "executors" ? (
                <ExecutorSection
                  workspaceId={workspaceId}
                  theme={theme}
                  compact={compact}
                  tools={tools}
                  onOpenDetail={openDetail}
                />
              ) : null}
              {allResources
                .filter(
                  (resource) =>
                    resource.id !== "workitems" &&
                    resource.id !== "memories" &&
                    resource.id !== "scheduled-tasks" &&
                    resource.id !== "executors",
                )
                .map((resource) =>
                active === resource.id ? (
                  <ResourceSection
                    key={`${resource.id}-${workspaceId}`}
                    resource={resource}
                    workspaceId={workspaceId}
                    theme={theme}
                    compact={compact}
                    tools={tools}
                    onOpenDetail={openDetail}
                  />
                ) : null,
              )}
            </>
          ) : null}
        </ScrollView>
      </View>

      {currentProject ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Badge label="已连接" theme={theme} tone="success" />
          <Text style={textStyle(theme, 11, true)}>通过 MCP 实时读写</Text>
        </View>
      ) : null}

      <WideModal
        title={t("AutoWonder 设置")}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        maxWidth={760}
      >
        <SettingsPanel
          theme={theme}
          compact={compact}
          showHeader={false}
          onSaved={() => {
            refreshAll();
          }}
        />
      </WideModal>

      {detail && workspaceId !== null ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: compact ? 8 : 24,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("关闭工单详情")}
            onPress={() => setDetail(null)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <EntityDetailModal
            open
            inline
            item={detail.item}
            resource={detail.resource}
            workspaceId={workspaceId}
            theme={theme}
            compact={compact}
            tools={tools}
            decorateItem={detail.decorateItem}
            onClose={() => setDetail(null)}
            onAction={(toolName, preset) => {
              const tool = tools.find((candidate) => candidate.name === toolName);
              if (!tool) return;
              setDetail(null);
              setDetailRunner({ tool, preset: { workspaceId, ...preset } });
            }}
          />
        </View>
      ) : null}

      {detailRunner ? (
        <ToolRunner
          open
          tool={detailRunner.tool}
          preset={detailRunner.preset}
          theme={theme}
          onClose={() => setDetailRunner(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["aw"] });
          }}
        />
      ) : null}
    </View>
  );
}

function WorkspaceSwitcher({
  projects,
  currentProject,
  workspaceId,
  theme,
  compact,
  open,
  onOpenChange,
  onSelect,
}: {
  projects: Record<string, unknown>[];
  currentProject: Record<string, unknown> | undefined;
  workspaceId: number | null;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const { t } = useI18n();
  const access = asString(currentProject?.accessLevel);
  const accessColor =
    access === "ADMIN"
      ? theme.colors.statusSuccess
      : access === "READ_WRITE"
        ? theme.colors.accent
        : theme.colors.foregroundMuted;
  return (
    <View style={{ position: "relative", zIndex: open ? 60 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("切换工作空间")}
        accessibilityState={{ expanded: open }}
        disabled={projects.length === 0}
        hitSlop={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => onOpenChange(!open)}
        style={({ pressed }) => ({
          width: "100%",
          height: 32,
          paddingHorizontal: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: open || focused ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.surface1,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          opacity: pressed || projects.length === 0 ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text
            numberOfLines={1}
            translate={false}
            style={{
              color: theme.colors.foreground,
              fontSize: 12,
              fontWeight: "600",
              flexShrink: 1,
            }}
          >
            {currentProject
              ? asString(currentProject.name)
              : t("工作空间")}
          </Text>
          {currentProject ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accessColor }}
              />
              <Text numberOfLines={1} style={textStyle(theme, 11, true)}>
                {displayStatus(access)}
              </Text>
            </View>
          ) : null}
        </View>
        <Icon
          name={open ? "ChevronUp" : "ChevronDown"}
          size={13}
          color={theme.colors.foregroundMuted}
        />
      </Pressable>

      {open ? (
        <View
          style={{
            position: "absolute",
            top: 38,
            left: 0,
            zIndex: 100,
            width: compact ? 236 : 280,
            maxHeight: 340,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
            paddingVertical: 6,
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 10,
              paddingHorizontal: 12,
              paddingVertical: 5,
            }}
          >
            切换工作空间
          </Text>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
            {projects.map((project) => {
              const id = asNumber(project.id);
              if (id === undefined) return null;
              const selected = id === workspaceId;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={asString(project.name)}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(id)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    gap: 3,
                    backgroundColor: selected
                      ? theme.colors.surface2
                      : pressed
                        ? theme.colors.surface2
                        : "transparent",
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text
                      numberOfLines={1}
                      translate={false}
                      style={{
                        color: theme.colors.foreground,
                        fontSize: 13,
                        fontWeight: selected ? "600" : "400",
                        flex: 1,
                      }}
                    >
                      {asString(project.name)}
                    </Text>
                    {selected ? (
                      <Icon name="Check" size={14} color={theme.colors.accent} />
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    translate={false}
                    style={textStyle(theme, 11, true)}
                  >
                    {t(displayStatus(asString(project.accessLevel)))}
                    {asString(project.description)
                      ? ` · ${asString(project.description)}`
                      : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function NavRow({
  label,
  active,
  theme,
  onPress,
}: {
  label: string;
  active: boolean;
  theme: PluginScreenProps["theme"];
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 11,
        paddingLeft: 14,
        paddingVertical: 9,
        borderRadius: 7,
        backgroundColor: active || focused ? theme.colors.surface2 : "transparent",
        opacity: pressed ? 0.75 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
      })}
    >
      <View
        style={{
          width: 3,
          height: 16,
          borderRadius: 2,
          backgroundColor: active ? theme.colors.accent : "transparent",
        }}
      />
      <Text
        style={{
          color: active ? theme.colors.accent : theme.colors.foregroundMuted,
          fontSize: 13,
          fontWeight: active ? "600" : "400",
          flex: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NavChip({
  label,
  active,
  theme,
  onPress,
}: {
  label: string;
  active: boolean;
  theme: PluginScreenProps["theme"];
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active || focused ? theme.colors.accent : theme.colors.border,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface0,
      }}
    >
      <Text
        style={{
          color: active ? theme.colors.accentForeground : theme.colors.foreground,
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
