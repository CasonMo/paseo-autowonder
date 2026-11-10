import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { WideModal } from "./WideModal";
import { callToolRpc, type ToolDescriptor } from "../shared/contracts";
import { ToolRunner } from "./ToolRunner";
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBox,
  Input,
  JsonBlock,
  KeyValueRows,
  Loading,
  MarkdownBlock,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import {
  FIELD_LABELS,
  asRecord,
  asString,
  errorMessage,
  formatDateTime,
  formatValue,
  listItems,
  statusCategoryLabel,
  truncate,
  workTypeLabel,
} from "./lib";

export type ColumnKind = "id" | "badge" | "date" | "text";

export interface ColumnDef {
  key: string;
  label: string;
  kind?: ColumnKind;
  width?: number;
  hideCompact?: boolean;
  value?: (item: Record<string, unknown>) => unknown;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface ActionDef {
  label: string;
  tool: string;
  preset?: (data: Record<string, unknown>) => Record<string, unknown>;
  tone?: "default" | "primary" | "danger";
  hint?: string;
}

export interface ExtraField {
  key: string;
  label: string;
  format?: "date" | "text" | "json";
  multiline?: boolean;
}

export interface ExtraSectionDef {
  title: string;
  tool: string;
  itemsKey?: string;
  emptyText?: string;
  args?: (data: Record<string, unknown>, workspaceId: number) => Record<string, unknown>;
  fields: ExtraField[];
  itemTitle?: (item: Record<string, unknown>) => string;
}

export interface DetailExtraProps {
  data: Record<string, unknown>;
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  onChanged: () => void;
}

export interface ResourceDef {
  id: string;
  label: string;
  listTool: string;
  detailTool?: string;
  createTool?: string;
  itemsKey?: string;
  titleField: string;
  subtitleFields?: string[];
  badgeField?: string;
  columns: ColumnDef[];
  filters?: FilterDef[];
  searchKey?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  summaryFields?: string[];
  contentField?: string;
  extraSections?: ExtraSectionDef[];
  actions?: ActionDef[];
  ActionsExtra?: ComponentType<DetailExtraProps>;
  createPreset?: Record<string, unknown>;
  DetailExtra?: ComponentType<DetailExtraProps>;
}

function renderColumnValue(
  item: Record<string, unknown>,
  column: ColumnDef,
  theme: PluginTheme,
) {
  const raw = column.value ? column.value(item) : item[column.key];
  if (raw === null || raw === undefined || raw === "") {
    return <Text style={textStyle(theme, 12, true)}>—</Text>;
  }
  if (column.kind === "badge") {
    const label = column.key === "workType" ? workTypeLabel(asString(raw)) : asString(raw);
    return <Badge label={label} theme={theme} />;
  }
  if (column.kind === "date") {
    return <Text style={textStyle(theme, 12, true)}>{formatDateTime(raw)}</Text>;
  }
  if (column.kind === "id") {
    return <Text style={{ ...textStyle(theme, 12, true), fontFamily: "monospace" }}>#{asString(raw)}</Text>;
  }
  return (
    <Text numberOfLines={1} translate={false} style={textStyle(theme, 12)}>
      {formatValue(raw)}
    </Text>
  );
}

export function ResourceSection({
  resource,
  workspaceId,
  theme,
  compact,
  tools,
  decorateItem,
  onOpenDetail,
}: {
  resource: ResourceDef;
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  tools: ToolDescriptor[];
  decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>;
  onOpenDetail?: (
    item: Record<string, unknown>,
    resource: ResourceDef,
    decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [runner, setRunner] = useState<{
    tool: ToolDescriptor;
    preset: Record<string, unknown>;
  } | null>(null);
  const pageSize = resource.pageSize ?? 20;
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const listReady = toolMap.has(resource.listTool);

  const query = useQuery({
    queryKey: ["aw", workspaceId, resource.id, page, keyword, filters],
    queryFn: async () => {
      const descriptor = toolMap.get(resource.listTool);
      const schema = (descriptor?.inputSchema ?? {}) as {
        properties?: Record<string, unknown>;
      };
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      const args: Record<string, unknown> = { workspaceId };
      if (allowed.has("page")) args.page = page;
      if (allowed.has("offset")) args.offset = (page - 1) * pageSize;
      if (allowed.has("size")) args.size = pageSize;
      for (const [key, value] of Object.entries(filters)) {
        if (allowed.has(key)) args[key] = value;
      }
      if (resource.searchKey && keyword.trim() && allowed.has(resource.searchKey)) {
        args[resource.searchKey] = keyword.trim();
      }
      const response = await call({ name: resource.listTool, arguments: args });
      if (response.isError) {
        throw new Error(
          response.contentText ??
            t("{{resource}}加载失败", { resource: t(resource.label) }),
        );
      }
      return response.data;
    },
    enabled: listReady,
    retry: 1,
  });

  const items = listItems(query.data, resource.itemsKey ?? "items").map((item) =>
    decorateItem ? decorateItem(item) : item,
  );

  function openCreate() {
    if (!resource.createTool) return;
    const tool = toolMap.get(resource.createTool);
    if (!tool) return;
    setRunner({
      tool,
      preset: { workspaceId, ...resource.createPreset },
    });
  }

  function openAction(toolName: string, data: Record<string, unknown>) {
    const tool = toolMap.get(toolName);
    if (!tool) return;
    setRunner({ tool, preset: { workspaceId, ...data } });
  }

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title={resource.label}
        subtitle={t("{{count}} 条{{more}}", {
          count: items.length,
          more: items.length >= pageSize ? t("（可能还有更多）") : "",
        })}
        theme={theme}
        trailing={
          <Row gap={6}>
            {resource.createTool ? (
              <Button
                label="新建"
                theme={theme}
                tone="primary"
                compact
                disabled={!toolMap.has(resource.createTool)}
                onPress={openCreate}
              />
            ) : null}
            <Button
              label="刷新"
              theme={theme}
              compact
              onPress={() => void queryClient.invalidateQueries({ queryKey: ["aw"] })}
            />
          </Row>
        }
      />

      {resource.searchKey || (resource.filters && resource.filters.length > 0) ? (
        <View style={{ gap: 10 }}>
          {resource.searchKey ? (
            <Input
              value={keyword}
              onChangeText={(value) => {
                setKeyword(value);
                setPage(1);
              }}
              placeholder={resource.searchPlaceholder ?? "搜索…"}
              theme={theme}
            />
          ) : null}
          {resource.filters?.map((filter) => (
            <View key={filter.key} style={{ gap: 6 }}>
              <Text style={textStyle(theme, 11, true)}>{filter.label}</Text>
              <Row gap={6}>
                <Chip
                  label="全部"
                  active={!filters[filter.key]}
                  theme={theme}
                  onPress={() => {
                    setFilters((current) => {
                      const next = { ...current };
                      delete next[filter.key];
                      return next;
                    });
                    setPage(1);
                  }}
                />
                {filter.options.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={filters[filter.key] === option.value}
                    theme={theme}
                    onPress={() => {
                      setFilters((current) => ({ ...current, [filter.key]: option.value }));
                      setPage(1);
                    }}
                  />
                ))}
              </Row>
            </View>
          ))}
        </View>
      ) : null}

      {!listReady || query.isLoading ? <Loading theme={theme} /> : null}
      {query.error ? (
        <ErrorBox error={query.error} theme={theme} onRetry={() => void query.refetch()} />
      ) : null}
      {listReady && !query.isLoading && !query.error && items.length === 0 ? (
        <Empty title="暂无数据" hint="切换工作区或调整筛选条件后再试。" theme={theme} />
      ) : null}

      <View style={{ gap: 8 }}>
        {items.map((item, index) => {
          const title = asString(item[resource.titleField]) || `#${formatValue(item.id)}`;
          const subtitle = (resource.subtitleFields ?? [])
            .map((field) => {
              const value = item[field];
              return value === null || value === undefined || value === "" ? "" : formatValue(value);
            })
            .filter(Boolean)
            .join(" · ");
          const badgeValue = resource.badgeField ? asString(item[resource.badgeField]) : "";
          return (
            <Pressable
              key={`${asString(item.id) || index}`}
              accessibilityRole="button"
              accessibilityLabel={title}
              onPress={() => {
                if (onOpenDetail) onOpenDetail(item, resource, decorateItem);
                else setSelected(item);
              }}
              style={({ pressed }) => ({
                backgroundColor: theme.colors.surface1,
                borderWidth: 1,
                borderColor: pressed ? theme.colors.accent : theme.colors.border,
                borderRadius: 9,
                padding: 12,
                gap: 8,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    numberOfLines={compact ? 2 : 1}
                    translate={false}
                    style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "500" }}
                  >
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text numberOfLines={1} translate={false} style={textStyle(theme, 11, true)}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {badgeValue ? <Badge label={badgeValue} theme={theme} /> : null}
                <Icon name="ChevronRight" size={16} color={theme.colors.foregroundMuted} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {resource.columns
                  .filter((column) => !(compact && column.hideCompact))
                  .slice(0, compact ? 3 : 6)
                  .map((column) => (
                    <View
                      key={column.key}
                      style={{
                        minWidth: compact ? undefined : column.width ?? 90,
                        flexGrow: compact ? 0 : 1,
                        flexBasis: compact ? undefined : column.width ?? 90,
                        maxWidth: compact ? "100%" : undefined,
                      }}
                    >
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                        {column.label}
                      </Text>
                      {renderColumnValue(item, column, theme)}
                    </View>
                  ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Row gap={8}>
        <Button
          label="上一页"
          theme={theme}
          compact
          disabled={page <= 1 || !listReady}
          onPress={() => setPage((value) => Math.max(1, value - 1))}
        />
        <Text style={textStyle(theme, 12, true)}>
          {t("第 {{page}} 页", { page })}
        </Text>
        <Button
          label="下一页"
          theme={theme}
          compact
          disabled={items.length < pageSize || !listReady}
          onPress={() => setPage((value) => value + 1)}
        />
      </Row>

      <EntityDetailModal
        open={selected !== null}
        item={selected}
        resource={resource}
        workspaceId={workspaceId}
        theme={theme}
        compact={compact}
        tools={tools}
        decorateItem={decorateItem}
        onClose={() => setSelected(null)}
        onAction={openAction}
      />

      <ToolRunnerSlot
        runner={runner}
        theme={theme}
        onClose={() => setRunner(null)}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["aw"] });
        }}
      />
    </View>
  );
}

function ToolRunnerSlot({
  runner,
  theme,
  onClose,
  onSuccess,
}: {
  runner: { tool: ToolDescriptor; preset: Record<string, unknown> } | null;
  theme: PluginTheme;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (!runner) return null;
  return (
    <ToolRunner
      open
      tool={runner.tool}
      preset={runner.preset}
      theme={theme}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

export function EntityDetailModal({
  open,
  item,
  resource,
  workspaceId,
  theme,
  compact,
  tools,
  decorateItem,
  inline = false,
  onClose,
  onAction,
}: {
  open: boolean;
  item: Record<string, unknown> | null;
  resource: ResourceDef;
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  tools: ToolDescriptor[];
  inline?: boolean;
  decorateItem?: (item: Record<string, unknown>) => Record<string, unknown>;
  onClose: () => void;
  onAction: (toolName: string, data: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rawOpen, setRawOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const detailQuery = useQuery({
    queryKey: ["aw", workspaceId, resource.id, "detail", item?.id],
    queryFn: async () => {
      if (!resource.detailTool || !item) return item;
      const response = await call({
        name: resource.detailTool,
        arguments: { workspaceId, id: item.id },
      });
      if (response.isError) throw new Error(response.contentText ?? "详情加载失败");
      return response.data;
    },
    enabled: open && item !== null,
    retry: 1,
  });

  const rawData = detailQuery.data
    ? { ...asRecord(item), ...asRecord(detailQuery.data) }
    : asRecord(item);
  const data = decorateItem ? decorateItem(rawData) : rawData;
  const title =
    asString(data[resource.titleField]) ||
    (data.id === undefined ? resource.label : `${resource.label} #${formatValue(data.id)}`);
  const content = resource.contentField ? asString(data[resource.contentField]) : "";
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools]);
  const actions = resource.actions ?? [];
  const visibleActions = actionsExpanded ? actions : actions.slice(0, 3);

  useEffect(() => {
    setActionsExpanded(false);
  }, [item?.id, resource.id]);

  const body = (
        <View style={{ gap: 14 }}>
          {detailQuery.isLoading ? <Loading theme={theme} label="加载详情…" /> : null}
          {detailQuery.error ? (
            <ErrorBox
              error={detailQuery.error}
              theme={theme}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : null}

          <View style={{ gap: 8 }}>
            <Row gap={6}>
              {resource.badgeField && asString(data[resource.badgeField]) ? (
                <Badge label={asString(data[resource.badgeField])} theme={theme} />
              ) : null}
              {data.statusCategory &&
              statusCategoryLabel(asString(data.statusCategory)) !==
                (resource.badgeField ? asString(data[resource.badgeField]) : "") ? (
                <Badge label={statusCategoryLabel(asString(data.statusCategory))} theme={theme} />
              ) : null}
              {data.id !== undefined ? (
                <Badge label={`#${formatValue(data.id)}`} theme={theme} tone="muted" />
              ) : null}
            </Row>
            {!inline ? (
              <Text
                selectable
                translate={false}
                style={{ color: theme.colors.foreground, fontSize: 15, lineHeight: 22 }}
              >
                {title}
              </Text>
            ) : null}
          </View>

          {actions.length > 0 || resource.ActionsExtra ? (
            <View style={{ gap: 8 }}>
              <Text style={textStyle(theme, 12, true)}>操作</Text>
              {actions.length > 0 || resource.ActionsExtra ? (
                <Row gap={7}>
                  {visibleActions.map((action) => (
                    <Button
                      key={action.label}
                      label={action.label}
                      theme={theme}
                      compact
                      tone={action.tone ?? "default"}
                      disabled={!toolMap.has(action.tool)}
                      onPress={() => {
                        if (!toolMap.has(action.tool)) {
                          toast.error(
                            t("工具 {{tool}} 不可用", { tool: action.tool }),
                          );
                          return;
                        }
                        const preset = action.preset
                          ? action.preset(data)
                          : { workspaceId, id: data.id };
                        onAction(action.tool, preset);
                      }}
                    />
                  ))}
                  {resource.ActionsExtra ? (
                    <resource.ActionsExtra
                      data={data}
                      workspaceId={workspaceId}
                      theme={theme}
                      compact={compact}
                      onChanged={() => {
                        void detailQuery.refetch();
                        void queryClient.invalidateQueries({ queryKey: ["aw"] });
                      }}
                    />
                  ) : null}
                  {actions.length > 3 ? (
                    <Button
                      label={actionsExpanded ? "收起" : "更多操作"}
                      theme={theme}
                      compact
                      icon={actionsExpanded ? "ChevronUp" : "ChevronDown"}
                      onPress={() => setActionsExpanded((value) => !value)}
                    />
                  ) : null}
                </Row>
              ) : null}
            </View>
          ) : null}

          {resource.summaryFields && resource.summaryFields.length > 0 ? (
            <Card theme={theme}>
              <KeyValueRows
                columns={compact ? 1 : 2}
                theme={theme}
                entries={resource.summaryFields.map((field) => ({
                  label: FIELD_LABELS[field] ?? field,
                  value: data[field],
                }))}
              />
            </Card>
          ) : null}

          {content ? (
            <View style={{ gap: 6 }}>
              <Text style={textStyle(theme, 12, true)}>正文</Text>
              <Card theme={theme}>
                <MarkdownBlock text={content} theme={theme} maxHeight={compact ? 260 : 380} />
              </Card>
            </View>
          ) : null}

          {resource.DetailExtra ? (
            <resource.DetailExtra
              data={data}
              workspaceId={workspaceId}
              theme={theme}
              compact={compact}
              onChanged={() => {
                void detailQuery.refetch();
                void queryClient.invalidateQueries({ queryKey: ["aw"] });
              }}
            />
          ) : null}

          {resource.extraSections?.map((section) => (
            <ExtraSection
              key={section.title}
              section={section}
              data={data}
              workspaceId={workspaceId}
              theme={theme}
              compact={compact}
            />
          ))}

          <Divider theme={theme} />
          <Row gap={8}>
            <Button
              label={rawOpen ? "收起原始数据" : "查看原始 JSON"}
              theme={theme}
              compact
              icon="Code"
              onPress={() => setRawOpen((value) => !value)}
            />
            <Button
              label="刷新详情"
              theme={theme}
              compact
              icon="RefreshCw"
              onPress={() => void detailQuery.refetch()}
            />
            {!inline ? (
              <Button label="关闭" theme={theme} compact icon="X" onPress={onClose} />
            ) : null}
          </Row>
          {rawOpen ? <JsonBlock value={data} theme={theme} maxHeight={360} /> : null}
        </View>
  );

  if (inline) {
    const availableWidth = compact
      ? Math.max(320, windowWidth - 16)
      : Math.max(560, windowWidth - 320);
    const dialogWidth = compact
      ? availableWidth
      : Math.min(1120, Math.max(360, availableWidth - 48));
    const dialogHeight = compact
      ? Math.max(420, windowHeight - 80)
      : Math.min(920, Math.max(400, windowHeight - 100));
    return (
      <View
        style={{
          width: dialogWidth,
          height: dialogHeight,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOpacity: 0.24,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 20,
        }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text
            selectable
            numberOfLines={2}
            style={{
              color: theme.colors.foreground,
              fontSize: 16,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {title}
          </Text>
          <Button label="关闭" icon="X" iconOnly compact theme={theme} onPress={onClose} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 14 }}
          nestedScrollEnabled
        >
          {body}
        </ScrollView>
      </View>
    );
  }

  return (
    <WideModal
      title={truncate(title, compact ? 48 : 90)}
      open={open}
      onClose={onClose}
      theme={theme}
      maxWidth={960}
    >
      {body}
    </WideModal>
  );
}

function ExtraSection({
  section,
  data,
  workspaceId,
  theme,
  compact,
}: {
  section: ExtraSectionDef;
  data: Record<string, unknown>;
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const args = section.args
    ? section.args(data, workspaceId)
    : { workspaceId, id: data.id };
  const query = useQuery({
    queryKey: ["aw", workspaceId, "extra", section.tool, data.id, JSON.stringify(args)],
    queryFn: async () => {
      const response = await call({ name: section.tool, arguments: args });
      if (response.isError) {
        throw new Error(
          response.contentText ??
            t("{{resource}}加载失败", { resource: t(section.title) }),
        );
      }
      return response.data;
    },
    enabled: data.id !== undefined,
    retry: 1,
  });
  const items = listItems(query.data, section.itemsKey ?? "items");

  return (
    <View style={{ gap: 7 }}>
      <Row gap={8}>
        <Text style={textStyle(theme, 12, true)}>
          {section.title} {items.length > 0 ? `(${items.length})` : ""}
        </Text>
        <Button
          label="刷新"
          theme={theme}
          compact
          onPress={() => void query.refetch()}
        />
      </Row>
      {query.isLoading ? <Loading theme={theme} label="加载中…" /> : null}
      {query.error ? <ErrorBox error={query.error} theme={theme} /> : null}
      {!query.isLoading && !query.error && items.length === 0 ? (
        <Text style={textStyle(theme, 12, true)}>{section.emptyText ?? "暂无记录"}</Text>
      ) : null}
      <View style={{ gap: 7 }}>
        {items.slice(0, 30).map((entry, index) => {
          const itemTitle = section.itemTitle?.(entry);
          const longFields = section.fields.filter((field) => field.multiline);
          const shortFields = section.fields.filter((field) => !field.multiline);
          return (
            <Card key={`${asString(entry.id) || index}`} theme={theme}>
              {itemTitle ? (
                <Text
                  translate={false}
                  style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }}
                >
                  {itemTitle}
                </Text>
              ) : null}
              {shortFields.length > 0 ? (
                <KeyValueRows
                  columns={compact ? 1 : 2}
                  theme={theme}
                  entries={shortFields.map((field) => ({
                    label: field.label,
                    value:
                      field.format === "date"
                        ? formatDateTime(entry[field.key])
                        : entry[field.key],
                  }))}
                />
              ) : null}
              {longFields.map((field) => (
                <View key={field.key} style={{ gap: 4 }}>
                  <Text style={textStyle(theme, 11, true)}>{field.label}</Text>
                  <MarkdownBlock
                    text={asString(entry[field.key]) || "—"}
                    theme={theme}
                    maxHeight={220}
                  />
                </View>
              ))}
            </Card>
          );
        })}
      </View>
    </View>
  );
}
