import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
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
  textStyle,
} from "./components";
import { displayStatus, errorMessage, FIELD_LABELS, jsonPretty } from "./lib";

interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  items?: JsonSchemaProperty;
  minimum?: number;
  maximum?: number;
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

  const schema = useMemo(() => (tool ? schemaOf(tool) : {}), [tool]);
  const properties = schema.properties ?? {};
  const required = useMemo(() => new Set(schema.required ?? []), [schema.required]);
  const destructive = tool ? isDestructive(tool.name) : false;
  const presetKey = JSON.stringify(preset ?? {});
  const relevantPreset = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(preset ?? {}).filter(([key]) => key in (schema.properties ?? {})),
      ),
    [presetKey, schema],
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
        if (!Number.isFinite(value)) throw new Error(`${key} 需要填写数字`);
        args[key] = type === "integer" ? Math.trunc(value) : value;
        continue;
      }
      if (type === "array" || type === "object") {
        try {
          args[key] = JSON.parse(text);
        } catch {
          throw new Error(`${key} 需要填写合法 JSON`);
        }
        continue;
      }
      args[key] = text;
    }

    for (const key of required) {
      if (args[key] === undefined) throw new Error(`缺少必填字段：${key}`);
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
      setError("这是删除/取消类操作，请先勾选确认。");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await call({ name: tool.name, arguments: args });
      setResult({
        ok: !response.isError,
        data: response.data,
        message: response.isError ? response.contentText ?? "工具返回错误" : undefined,
      });
      if (response.isError) {
        toast.error(response.contentText ?? `${humanToolName(tool.name)} 执行失败`);
      } else {
        toast.show(`${humanToolName(tool.name)} 执行成功`, { variant: "success" });
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

  if (!tool) return null;

  return (
    <Modal
      title={humanToolName(tool.name)}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 5 }}>
            <Row gap={6}>
              <Badge label="MCP 工具" theme={theme} tone="accent" />
              {destructive ? <Badge label="需谨慎" theme={theme} tone="danger" /> : null}
            </Row>
            <Text selectable style={{ ...textStyle(theme, 11, true), lineHeight: 16 }}>
              {tool.description || tool.name}
            </Text>
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
              <Text style={textStyle(theme, 11, true)}>
                已预填 {Object.keys(relevantPreset).length} 个参数
              </Text>
            ) : null}
          </Row>

          <Divider theme={theme} />

          {rawMode ? (
            <LabeledField label="arguments" hint="完整 JSON 对象，适合复杂嵌套参数。" theme={theme}>
              <JSONTextInput value={rawText} onChangeText={setRawText} theme={theme} />
            </LabeledField>
          ) : (
            <View style={{ gap: 14 }}>
              {Object.keys(properties).length === 0 ? (
                <Text style={textStyle(theme, 12, true)}>此工具不需要参数。</Text>
              ) : (
                Object.entries(properties).map(([key, property]) => (
                  <SchemaField
                    key={key}
                    name={key}
                    property={property}
                    required={required.has(key)}
                    text={fields[key] ?? ""}
                    booleanValue={booleans[key]}
                    theme={theme}
                    onChangeText={(value) => {
                      setFields((current) => ({ ...current, [key]: value }));
                      setError(null);
                    }}
                    onChangeBoolean={(value) => {
                      setBooleans((current) => ({ ...current, [key]: value }));
                      setError(null);
                    }}
                  />
                ))
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
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12, flex: 1 }}>
                我确认执行这个删除/取消类操作
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
                style={{
                  color: result.ok ? theme.colors.statusSuccess : theme.colors.statusDanger,
                  fontSize: 12,
                }}
              >
                {result.ok ? "执行成功" : result.message ?? "执行失败"}
              </Text>
              <JsonBlock value={result.data} theme={theme} maxHeight={280} />
            </Card>
          ) : null}
        </View>
      </Modal.Content>
    </Modal>
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
  theme,
  onChangeText,
  onChangeBoolean,
}: {
  name: string;
  property: JsonSchemaProperty;
  required: boolean;
  text: string;
  booleanValue: boolean | undefined;
  theme: PluginTheme;
  onChangeText: (value: string) => void;
  onChangeBoolean: (value: boolean | undefined) => void;
}) {
  const type = normalizedType(property);
  const description = property.description;
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
        hint={description}
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

  if (property.enum && property.enum.length > 0) {
    const label = FIELD_LABELS[name] ?? name;
    return (
      <LabeledField label={label} hint={description} theme={theme} required={required}>
        <Row gap={6}>
          {property.enum.map((value) => {
            const option = String(value);
            return (
              <Chip
                key={option}
                label={displayStatus(option)}
                active={text === option}
                theme={theme}
                onPress={() => onChangeText(option)}
              />
            );
          })}
          {!required ? (
            <Chip label="清空" active={text === ""} theme={theme} onPress={() => onChangeText("")} />
          ) : null}
        </Row>
      </LabeledField>
    );
  }

  return (
    <LabeledField
      label={FIELD_LABELS[name] ?? name}
      hint={
        description
          ? `${description}${!required ? "（可选，留空表示不传）" : ""}`
          : !required
            ? "可选，留空表示不传"
            : undefined
      }
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
            ? "数字"
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
