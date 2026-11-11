import { useRpc } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "./Text";
import { callToolRpc, type ToolDescriptor } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  JsonBlock,
  LabeledField,
  Row,
  SelectField,
  textStyle,
  type FieldOption,
} from "./components";
import {
  asNumber,
  asRecord,
  asString,
  displayStatus,
  errorMessage,
  FIELD_LABELS,
  jsonPretty,
  listItems,
} from "./lib";
import { useI18n } from "./i18n";
import { WideModal } from "./WideModal";

interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  items?: JsonSchemaProperty;
  minimum?: number;
  maximum?: number;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  const?: unknown;
}

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface CallState {
  ok: boolean;
  data: unknown;
  message?: string;
  redacted?: boolean;
}

const PRIMARY_FIELDS: Record<string, string[]> = {
  "autowonder.create_workitem": ["workType", "title", "contentMd"],
};

const STATIC_OPTIONS: Record<string, FieldOption[]> = {
  workType: [
    { value: "REQ", label: "需求" },
    { value: "BUG", label: "缺陷" },
    { value: "TASK", label: "任务" },
  ],
  priority: [
    { value: "", label: "不指定（默认 2）" },
    { value: "1", label: "紧急" },
    { value: "2", label: "高" },
    { value: "3", label: "中" },
    { value: "4", label: "低" },
  ],
  assigneeType: [
    { value: "", label: "不指定" },
    { value: "HUMAN", label: "真人" },
    { value: "AGENT", label: "数字员工" },
  ],
  statusCategory: [
    { value: "NEW", label: "待处理" },
    { value: "IN_PROGRESS", label: "进行中" },
    { value: "PENDING_DECISION", label: "待决策" },
    { value: "DONE", label: "已完成" },
    { value: "CANCELED", label: "已取消" },
  ],
  permLevel: [
    { value: "READ", label: "只读" },
    { value: "WRITE", label: "读写" },
    { value: "ADMIN", label: "管理员" },
  ],
};

const SKILL_PACKAGE_TYPE_OPTIONS: FieldOption[] = [
  { value: "SKILL", label: "技能" },
  { value: "PLUGIN", label: "插件" },
  { value: "HOOK", label: "钩子" },
];

const TOOL_FIELD_OPTIONS: Record<string, Record<string, FieldOption[]>> = {
  "autowonder.create_repo_relation": {
    relationType: [
      { value: "DEPENDS_ON", label: "依赖" },
      { value: "PROVIDES_API_TO", label: "提供 API" },
    ],
  },
  "autowonder.inspect_skill_package": { type: SKILL_PACKAGE_TYPE_OPTIONS },
  "autowonder.upload_skill_package": { type: SKILL_PACKAGE_TYPE_OPTIONS },
  "autowonder.create_skill_from_package": { type: SKILL_PACKAGE_TYPE_OPTIONS },
  "autowonder.update_skill_package": { type: SKILL_PACKAGE_TYPE_OPTIONS },
};

const TOKEN_RESULT_TOOLS = new Set([
  "autowonder.get_executor_token",
  "autowonder.workitem_cli_download_token",
  "autowonder.workitem_cli_upload_token",
]);
const ENV_RESULT_TOOLS = new Set([
  "autowonder.get_agent",
  "autowonder.get_agent_version",
]);

function maskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (/token|secret|password/i.test(key)) {
      next[key] = "••••••";
    } else {
      next[key] = maskValue(item);
    }
  }
  return next;
}

function maskEnvironmentVariables(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskEnvironmentVariables);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (key === "environmentVariables" && Array.isArray(item)) {
      next[key] = item.map((entry) => {
        const env = asRecord(entry);
        return "value" in env ? { ...env, value: "••••••" } : env;
      });
    } else {
      next[key] = maskEnvironmentVariables(item);
    }
  }
  return next;
}

function safeToolResult(
  toolName: string,
  data: unknown,
): { data: unknown; redacted: boolean } {
  if (TOKEN_RESULT_TOOLS.has(toolName)) {
    return { data: maskValue(data), redacted: true };
  }
  if (ENV_RESULT_TOOLS.has(toolName)) {
    return { data: maskEnvironmentVariables(data), redacted: true };
  }
  return { data, redacted: false };
}

const FIELD_HINTS: Record<string, string> = {
  workspaceId: "",
  workType: "",
  priority: "",
  assigneeType: "",
  assigneeRef: "数字员工请选择；真人请填写用户 ID。",
  sdlcId: "",
  squadId: "",
  title: "",
  contentMd: "支持 Markdown；建议写清背景、目标、边界和验收标准。",
  scheduledStartAt: "ISO-8601 时间，例如 2026-08-27T10:00:00Z。",
};

function optionsFromSchema(property: JsonSchemaProperty): FieldOption[] | undefined {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    return property.enum.map((value) => ({
      value: String(value),
      label: displayStatus(String(value)),
    }));
  }
  const variants = property.oneOf ?? property.anyOf;
  if (!variants || variants.length === 0) return undefined;
  const options = variants
    .map((variant) => variant.const ?? (variant.enum?.length === 1 ? variant.enum[0] : undefined))
    .filter((value): value is string | number | boolean => value !== undefined)
    .map((value) => ({ value: String(value), label: displayStatus(String(value)) }));
  return options.length > 0 ? options : undefined;
}

function schemaOf(tool: ToolDescriptor): JsonSchema {
  return tool.inputSchema as JsonSchema;
}

function normalizedType(property: JsonSchemaProperty): string {
  if (Array.isArray(property.type)) {
    return property.type.find((type) => type !== "null") ?? "string";
  }
  return property.type ?? "string";
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function isDestructive(toolName: string): boolean {
  return (
    /(^|\.)(delete|remove|unbind|archive|cancel|close)_/.test(toolName) ||
    /control_delivery$/.test(toolName) ||
    /transition_scheduled_task$/.test(toolName)
  );
}

function humanToolName(name: string): string {
  return name.replace(/^autowonder\./, "");
}

function ToolDescriptionTip({
  description,
  theme,
}: {
  description: string;
  theme: PluginTheme;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const width = Math.min(440, Math.max(240, windowWidth - 120));
  const maxHeight = Math.min(320, Math.max(180, windowHeight - 220));
  return (
    <View
      style={{ position: "relative", zIndex: open ? 60 : 1 }}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("查看工具说明")}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: open ? theme.colors.surface2 : "transparent",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name="CircleHelp" size={15} color={theme.colors.foregroundMuted} />
      </Pressable>
      {open ? (
        <View
          style={{
            position: "absolute",
            top: 24,
            left: 0,
            width,
            maxHeight,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
            padding: 10,
            gap: 6,
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 12,
            zIndex: 60,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{
                flex: 1,
                color: theme.colors.foregroundMuted,
                fontSize: 10,
                fontWeight: "600",
              }}
            >
              {t("工具说明（MCP 原文）")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("关闭")}
              hitSlop={6}
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="X" size={12} color={theme.colors.foregroundMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: Math.max(120, maxHeight - 34) }} nestedScrollEnabled>
            <Text
              selectable
              translate={false}
              style={{
                color: theme.colors.foreground,
                fontSize: 11,
                lineHeight: 16,
              }}
            >
              {description}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function ToolRunner({
  open,
  onClose,
  tool,
  preset,
  theme,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  tool: ToolDescriptor | null;
  preset?: Record<string, unknown>;
  theme: PluginTheme;
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [booleans, setBooleans] = useState<Record<string, boolean | undefined>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CallState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const schema = useMemo(() => (tool ? schemaOf(tool) : {}), [tool]);
  const properties = schema.properties ?? {};
  const required = useMemo(() => new Set(schema.required ?? []), [schema.required]);
  const destructive = tool ? isDestructive(tool.name) : false;
  const collapsesFields = tool ? Boolean(PRIMARY_FIELDS[tool.name]) : false;
  const optionsExpanded = !collapsesFields || showAdvanced;
  const presetKey = JSON.stringify(preset ?? {});
  const relevantPreset = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(preset ?? {}).filter(([key]) => key in (schema.properties ?? {})),
      ),
    [presetKey, schema],
  );
  const workspaceIdForOptions =
    asNumber(fields.workspaceId) ?? asNumber(preset?.workspaceId);
  const projectsQuery = useQuery({
    queryKey: ["aw", "tool-options", "projects"],
    queryFn: async () => {
      const response = await call({ name: "autowonder.list_projects", arguments: {} });
      if (response.isError) throw new Error(response.contentText ?? "工作区加载失败");
      return response.data;
    },
    enabled: open && optionsExpanded && "workspaceId" in properties,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const agentsQuery = useQuery({
    queryKey: ["aw", workspaceIdForOptions, "tool-options", "agents"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_agents",
        arguments: { workspaceId: workspaceIdForOptions, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "数字员工加载失败");
      return response.data;
    },
    enabled:
      open &&
      optionsExpanded &&
      "assigneeRef" in properties &&
      (fields.assigneeType ?? "") === "AGENT" &&
      workspaceIdForOptions !== undefined,
    staleTime: 60 * 1000,
    retry: 1,
  });
  const sdlcsQuery = useQuery({
    queryKey: ["aw", workspaceIdForOptions, "tool-options", "sdlcs"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_sdlcs",
        arguments: { workspaceId: workspaceIdForOptions, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "SDLC 加载失败");
      return response.data;
    },
    enabled:
      open &&
      optionsExpanded &&
      "sdlcId" in properties &&
      workspaceIdForOptions !== undefined,
    staleTime: 60 * 1000,
    retry: 1,
  });
  const squadsQuery = useQuery({
    queryKey: ["aw", workspaceIdForOptions, "tool-options", "squads"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_squads",
        arguments: { workspaceId: workspaceIdForOptions, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "小队加载失败");
      return response.data;
    },
    enabled:
      open &&
      optionsExpanded &&
      "squadId" in properties &&
      workspaceIdForOptions !== undefined,
    staleTime: 60 * 1000,
    retry: 1,
  });
  const projectOptions = useMemo(
    () =>
      listItems(projectsQuery.data).flatMap((item) => {
        const id = asNumber(item.id);
        if (id === undefined) return [];
        const name = asString(item.name);
        return [{ value: String(id), label: name ? `${name} (${id})` : String(id) }];
      }),
    [projectsQuery.data],
  );
  const agentOptions = useMemo(
    () =>
      listItems(agentsQuery.data).flatMap((item) => {
        const id = asNumber(item.id);
        if (id === undefined) return [];
        const name = asString(item.name);
        return [{ value: String(id), label: name ? `${name} #${id}` : `#${id}` }];
      }),
    [agentsQuery.data],
  );
  const sdlcOptions = useMemo(
    () =>
      listItems(sdlcsQuery.data).flatMap((item) => {
        const id = asNumber(item.id);
        if (id === undefined) return [];
        const name = asString(item.name);
        return [{ value: String(id), label: name ? `${name} #${id}` : `#${id}` }];
      }),
    [sdlcsQuery.data],
  );
  const squadOptions = useMemo(
    () =>
      listItems(squadsQuery.data).flatMap((item) => {
        const id = asNumber(item.id);
        if (id === undefined) return [];
        const name = asString(item.name);
        return [{ value: String(id), label: name ? `${name} #${id}` : `#${id}` }];
      }),
    [squadsQuery.data],
  );

  useEffect(() => {
    if (!open || !tool) return;
    const presetForTool = Object.fromEntries(
      Object.entries(preset ?? {}).filter(
        ([key]) => key in (schemaOf(tool).properties ?? {}),
      ),
    );
    const initialFields: Record<string, string> = {};
    const initialBooleans: Record<string, boolean | undefined> = {};
    for (const [key, property] of Object.entries(schemaOf(tool).properties ?? {})) {
      const value = presetForTool[key] ?? property.default;
      const type = normalizedType(property);
      if (type === "boolean") {
        initialBooleans[key] = typeof value === "boolean" ? value : undefined;
      } else {
        initialFields[key] = textOf(value);
      }
    }
    setFields(initialFields);
    setBooleans(initialBooleans);
    setRawText(jsonPretty(presetForTool));
    setRawMode(false);
    setError(null);
    setResult(null);
    setConfirmed(false);
    setShowAdvanced(false);
  }, [open, tool?.name, presetKey]);

  function buildArgs(): Record<string, unknown> {
    if (rawMode) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error("JSON 参数格式不正确");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("JSON 参数必须是对象");
      }
      return parsed as Record<string, unknown>;
    }

    const args: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(properties)) {
      const type = normalizedType(property);
      if (type === "boolean") {
        const value = booleans[key];
        if (value !== undefined) args[key] = value;
        continue;
      }
      const text = (fields[key] ?? "").trim();
      if (text === "") continue;
      if (type === "integer" || type === "number") {
        const value = Number(text);
        if (!Number.isFinite(value)) {
          throw new Error(t("{{key}} 需要填写数字", { key }));
        }
        args[key] = type === "integer" ? Math.trunc(value) : value;
        continue;
      }
      if (type === "array" || type === "object") {
        try {
          args[key] = JSON.parse(text);
        } catch {
          throw new Error(t("{{key}} 需要填写合法 JSON", { key }));
        }
        continue;
      }
      args[key] = text;
    }

    for (const key of required) {
      if (args[key] === undefined) {
        throw new Error(t("缺少必填字段：{{key}}", { key }));
      }
    }
    return args;
  }

  async function run() {
    if (!tool) return;
    let args: Record<string, unknown>;
    try {
      args = buildArgs();
      setError(null);
    } catch (buildError) {
      setError(errorMessage(buildError));
      return;
    }
    if (destructive && !confirmed) {
      setError(t("这是删除/取消类操作，请先勾选确认。"));
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await call({ name: tool.name, arguments: args });
      const safe = safeToolResult(tool.name, response.data);
      setResult({
        ok: !response.isError,
        data: safe.data,
        message: response.isError ? response.contentText ?? "工具返回错误" : undefined,
        redacted: safe.redacted,
      });
      if (response.isError) {
        toast.error(
          response.contentText ?? t("{{tool}} 执行失败", { tool: humanToolName(tool.name) }),
        );
      } else {
        toast.show(
          t("{{tool}} 执行成功", { tool: humanToolName(tool.name) }),
          { variant: "success" },
        );
        void queryClient.invalidateQueries({ queryKey: ["aw"] });
        onSuccess?.();
      }
    } catch (runError) {
      setResult({ ok: false, data: null, message: errorMessage(runError) });
      toast.error(errorMessage(runError));
    } finally {
      setRunning(false);
    }
  }

  function optionsForField(
    key: string,
    property: JsonSchemaProperty,
  ): FieldOption[] | undefined {
    const fromSchema = optionsFromSchema(property);
    if (fromSchema) {
      return fromSchema.map((option) => ({ ...option, label: t(option.label) }));
    }
    const toolOptions = tool ? TOOL_FIELD_OPTIONS[tool.name]?.[key] : undefined;
    if (toolOptions) {
      return toolOptions.map((option) => ({ ...option, label: t(option.label) }));
    }
    if (key === "workspaceId") {
      return projectOptions.length > 0 ? projectOptions : undefined;
    }
    if (key === "assigneeRef") {
      if ((fields.assigneeType ?? "") !== "AGENT" || agentOptions.length === 0) {
        return undefined;
      }
      return agentOptions;
    }
    if (key === "sdlcId") {
      return sdlcOptions.length > 0
        ? [{ value: "", label: t("不指定") }, ...sdlcOptions]
        : undefined;
    }
    if (key === "squadId") {
      return squadOptions.length > 0
        ? [{ value: "", label: t("不指定") }, ...squadOptions]
        : undefined;
    }
    return STATIC_OPTIONS[key]?.map((option) => ({
      ...option,
      label: t(option.label),
    }));
  }

  if (!tool) return null;

  const fieldEntries = Object.entries(properties);
  const primaryKeys = PRIMARY_FIELDS[tool.name];
  const primaryEntries = primaryKeys
    ? fieldEntries.filter(([key]) => primaryKeys.includes(key))
    : fieldEntries;
  const visiblePrimary = primaryEntries.length > 0 ? primaryEntries : fieldEntries;
  const advancedEntries =
    primaryKeys && primaryEntries.length > 0
      ? fieldEntries.filter(([key]) => !primaryKeys.includes(key))
      : [];
  const missingAdvancedRequired = advancedEntries.filter(([key]) => {
    if ((fields[key] ?? "").trim() !== "") return false;
    if (required.has(key)) return true;
    return key === "assigneeRef" && (fields.assigneeType ?? "") === "AGENT";
  }).length;

  function renderField(key: string, property: JsonSchemaProperty) {
    const fieldRequired =
      required.has(key) || (key === "assigneeRef" && (fields.assigneeType ?? "") === "AGENT");
    const fieldOptions = optionsForField(key, property);
    const options = fieldOptions
      ? fieldRequired
        ? fieldOptions.filter((option) => option.value !== "")
        : fieldOptions.some((option) => option.value === "")
          ? fieldOptions
          : [{ value: "", label: t("不指定") }, ...fieldOptions]
      : undefined;
    return (
      <SchemaField
        key={key}
        name={key}
        property={property}
        required={fieldRequired}
        text={fields[key] ?? ""}
        booleanValue={booleans[key]}
        options={options}
        theme={theme}
        onChangeText={(value) => {
          setFields((current) => {
            const next = { ...current, [key]: value };
            if (key === "assigneeType" && value !== "AGENT") next.assigneeRef = "";
            if (key === "workspaceId") {
              next.assigneeRef = "";
              next.sdlcId = "";
              next.squadId = "";
            }
            return next;
          });
          setError(null);
        }}
        onChangeBoolean={(value) => {
          setBooleans((current) => ({ ...current, [key]: value }));
          setError(null);
        }}
      />
    );
  }

  return (
    <WideModal
      title={humanToolName(tool.name)}
      open={open}
      onClose={onClose}
      theme={theme}
    >
      <View style={{ gap: 14 }}>
          <View style={{ gap: 5, position: "relative", zIndex: 20 }}>
            <Row gap={6}>
              <Badge label="MCP 工具" theme={theme} tone="accent" />
              {destructive ? <Badge label="需谨慎" theme={theme} tone="danger" /> : null}
              {tool.description ? (
                <ToolDescriptionTip description={tool.description} theme={theme} />
              ) : null}
            </Row>
          </View>

          <Row gap={6}>
            <Chip
              label="表单"
              active={!rawMode}
              theme={theme}
              onPress={() => setRawMode(false)}
            />
            <Chip label="JSON" active={rawMode} theme={theme} onPress={() => setRawMode(true)} />
            {Object.keys(relevantPreset).length > 0 ? (
              <Text translate={false} style={textStyle(theme, 11, true)}>
                {t("已预填 {{count}} 个参数", {
                  count: Object.keys(relevantPreset).length,
                })}
              </Text>
            ) : null}
          </Row>

          <Divider theme={theme} />

          {rawMode ? (
            <LabeledField
              label="arguments"
              hint={t("完整 JSON 对象，适合复杂嵌套参数。")}
              theme={theme}
            >
              <JSONTextInput value={rawText} onChangeText={setRawText} theme={theme} />
            </LabeledField>
          ) : (
            <View style={{ gap: 14 }}>
              {fieldEntries.length === 0 ? (
                <Text style={textStyle(theme, 12, true)}>此工具不需要参数。</Text>
              ) : (
                <>
                  {visiblePrimary.map(([key, property]) => renderField(key, property))}
                  {advancedEntries.length > 0 ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showAdvanced }}
                        onPress={() => setShowAdvanced((current) => !current)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface1,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text
                          translate={false}
                          style={{
                            flex: 1,
                            color: theme.colors.foreground,
                            fontSize: 12,
                          }}
                        >
                          {showAdvanced
                            ? t("收起更多参数")
                            : t("展开更多参数（{{count}}）", {
                                count: advancedEntries.length,
                              })}
                        </Text>
                        {!showAdvanced && missingAdvancedRequired > 0 ? (
                          <Text
                            translate={false}
                            style={{
                              color: theme.colors.statusWarning,
                              fontSize: 11,
                            }}
                          >
                            {t("含 {{count}} 个未填必填项", {
                              count: missingAdvancedRequired,
                            })}
                          </Text>
                        ) : null}
                        <Icon
                          name={showAdvanced ? "ChevronUp" : "ChevronDown"}
                          size={14}
                          color={theme.colors.foregroundMuted}
                        />
                      </Pressable>
                      {showAdvanced
                        ? advancedEntries.map(([key, property]) =>
                            renderField(key, property),
                          )
                        : null}
                    </>
                  ) : null}
                </>
              )}
            </View>
          )}

          {destructive ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((value) => !value)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: confirmed ? theme.colors.statusDanger : theme.colors.border,
                backgroundColor: theme.colors.surface0,
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: theme.colors.statusDanger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {confirmed ? (
                  <Icon name="Check" size={12} color={theme.colors.statusDanger} />
                ) : null}
              </View>
              <Text
                translate={false}
                style={{ color: theme.colors.statusDanger, fontSize: 12, flex: 1 }}
              >
                {t("我确认执行这个删除/取消类操作")}
              </Text>
            </Pressable>
          ) : null}

          {error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text>
          ) : null}

          <Row gap={8}>
            <Button
              label={running ? "执行中…" : "执行"}
              tone="primary"
              theme={theme}
              icon={running ? undefined : "Play"}
              disabled={running}
              onPress={() => void run()}
            />
            <Button label="关闭" theme={theme} icon="X" onPress={onClose} />
          </Row>

          {result ? (
            <Card
              theme={theme}
              style={{
                borderColor: result.ok ? theme.colors.statusSuccess : theme.colors.statusDanger,
              }}
            >
              <Text
                translate={false}
                style={{
                  color: result.ok ? theme.colors.statusSuccess : theme.colors.statusDanger,
                  fontSize: 12,
                }}
              >
                {result.ok
                  ? t("执行成功")
                  : result.message ?? t("执行失败")}
              </Text>
              {result.redacted ? (
                <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
                  {t("敏感字段已打码；如需 token，请在 AutoWonder 对应页面查看。")}
                </Text>
              ) : null}
              <JsonBlock value={result.data} theme={theme} maxHeight={280} />
            </Card>
          ) : null}
      </View>
    </WideModal>
  );
}

function JSONTextInput({
  value,
  onChangeText,
  theme,
}: {
  value: string;
  onChangeText: (value: string) => void;
  theme: PluginTheme;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      placeholder="{}"
      placeholderTextColor={theme.colors.foregroundMuted}
      style={{
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
        minHeight: 220,
        fontSize: 12,
        textAlignVertical: "top",
      }}
    />
  );
}

function SchemaField({
  name,
  property,
  required,
  text,
  booleanValue,
  options,
  theme,
  onChangeText,
  onChangeBoolean,
}: {
  name: string;
  property: JsonSchemaProperty;
  required: boolean;
  text: string;
  booleanValue: boolean | undefined;
  options?: FieldOption[];
  theme: PluginTheme;
  onChangeText: (value: string) => void;
  onChangeBoolean: (value: boolean | undefined) => void;
}) {
  const { t } = useI18n();
  const type = normalizedType(property);
  const description = property.description;
  const hasHintOverride = Object.prototype.hasOwnProperty.call(FIELD_HINTS, name);
  const hint = hasHintOverride
    ? FIELD_HINTS[name] || undefined
    : description
      ? `${description}${!required ? t("（可选，留空表示不传）") : ""}`
      : !required
        ? t("可选，留空表示不传")
        : undefined;
  const multiline =
    type === "array" ||
    type === "object" ||
    property.format === "textarea" ||
    /md$|content|description|instruction|prompt|body|json|checklist|policy|background|responsibilit/i.test(
      name,
    );

  if (type === "boolean") {
    return (
      <LabeledField
        label={FIELD_LABELS[name] ?? name}
        hint={hint}
        hintIcon
        theme={theme}
        required={required}
      >
        <Row gap={6}>
          <Chip
            label="不设置"
            active={booleanValue === undefined}
            theme={theme}
            onPress={() => onChangeBoolean(undefined)}
          />
          <Chip
            label="是"
            active={booleanValue === true}
            theme={theme}
            onPress={() => onChangeBoolean(true)}
          />
          <Chip
            label="否"
            active={booleanValue === false}
            theme={theme}
            onPress={() => onChangeBoolean(false)}
          />
        </Row>
      </LabeledField>
    );
  }

  if (options && options.length > 0) {
    return (
      <LabeledField
        label={FIELD_LABELS[name] ?? name}
        hint={hint}
        hintIcon
        theme={theme}
        required={required}
      >
        <SelectField value={text} options={options} onChange={onChangeText} theme={theme} />
      </LabeledField>
    );
  }

  return (
    <LabeledField
      label={FIELD_LABELS[name] ?? name}
      hint={hint}
      hintIcon
      theme={theme}
      required={required}
    >
      <TextInput
        value={text}
        onChangeText={onChangeText}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={
          type === "integer" || type === "number"
            ? t("数字")
            : type === "array"
              ? "[1, 2]"
              : type === "object"
                ? "{}"
                : undefined
        }
        placeholderTextColor={theme.colors.foregroundMuted}
        keyboardType={type === "integer" || type === "number" ? "numeric" : "default"}
        style={{
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 9,
          fontSize: 12,
          minHeight: multiline ? (name === "contentMd" ? 180 : 100) : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </LabeledField>
  );
}
