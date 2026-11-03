import { copyText } from "@getpaseo/plugin/client/react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  displayStatus,
  errorMessage,
  formatValue,
  jsonPretty,
  priorityLabel,
  statusTone,
} from "./lib";
import { Text } from "./Text";
import { useI18n } from "./i18n";

export interface UIProps {
  theme: PluginTheme;
  compact: boolean;
}

export const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, monospace",
});

export function textStyle(theme: PluginTheme, size = 14, muted = false): TextStyle {
  return {
    color: muted ? theme.colors.foregroundMuted : theme.colors.foreground,
    fontSize: size,
  };
}

export function Chip({
  label,
  active = false,
  onPress,
  theme,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  theme: PluginTheme;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      disabled={disabled || !onPress}
      hitSlop={6}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active || focused ? theme.colors.accent : theme.colors.border,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface1,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        minHeight: 32,
        justifyContent: "center",
      })}
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

export function Badge({
  label,
  theme,
  tone,
}: {
  label: string;
  theme: PluginTheme;
  tone?: "success" | "warning" | "danger" | "accent" | "muted";
}) {
  const displayLabel = displayStatus(label);
  const resolved = tone ?? statusTone(label);
  const color =
    resolved === "success"
      ? theme.colors.statusSuccess
      : resolved === "warning"
        ? theme.colors.statusWarning
        : resolved === "danger"
          ? theme.colors.statusDanger
          : resolved === "accent"
            ? theme.colors.accent
            : theme.colors.foregroundMuted;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: theme.colors.surface2,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 11 }}>{displayLabel}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  theme,
  disabled = false,
  tone = "default",
  compact = false,
  icon,
  iconOnly = false,
}: {
  label: string;
  onPress: () => void;
  theme: PluginTheme;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  compact?: boolean;
  icon?: string;
  iconOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const background =
    tone === "primary"
      ? theme.colors.accent
      : tone === "danger"
        ? theme.colors.statusDanger
        : theme.colors.surface2;
  const color =
    tone === "primary"
      ? theme.colors.accentForeground
      : tone === "danger"
        ? "#ffffff"
        : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: compact ? (iconOnly ? 9 : 10) : 14,
        paddingVertical: compact ? 8 : 9,
        borderRadius: 8,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: focused
          ? theme.colors.accent
          : tone === "default"
            ? theme.colors.border
            : "transparent",
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        alignSelf: "flex-start",
        minHeight: compact ? 32 : 36,
        flexDirection: "row",
        alignItems: "center",
        gap: iconOnly ? 0 : 6,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      {icon ? <Icon name={icon} size={compact ? 13 : 14} color={color} /> : null}
      {iconOnly ? null : (
        <Text style={{ color, fontSize: compact ? 12 : 13, fontWeight: "500" }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  theme,
  style,
}: {
  children: ReactNode;
  theme: PluginTheme;
  style?: ViewStyle;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        padding: 14,
        gap: 10,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  trailing,
  theme,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  theme: PluginTheme;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "600" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function LabeledField({
  label,
  hint,
  error,
  children,
  theme,
  required = false,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  theme: PluginTheme;
  required?: boolean;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }}>
        {label}
        {required ? <Text style={{ color: theme.colors.statusDanger }}> *</Text> : null}
      </Text>
      {children}
      {hint ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 }}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{error}</Text>
      ) : null}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  theme,
  multiline = false,
  secureTextEntry = false,
  numberOfLines,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  theme: PluginTheme;
  multiline?: boolean;
  secureTextEntry?: boolean;
  numberOfLines?: number;
}) {
  const { t } = useI18n();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ? t(placeholder) : undefined}
      placeholderTextColor={theme.colors.foregroundMuted}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      numberOfLines={numberOfLines}
      autoCapitalize="none"
      autoCorrect={false}
      style={{
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 11,
        paddingVertical: 10,
        fontSize: 13,
        minHeight: multiline ? 82 : undefined,
        textAlignVertical: multiline ? "top" : "center",
      }}
    />
  );
}

export function SearchInput({
  value,
  onChangeText,
  placeholder,
  theme,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  theme: PluginTheme;
}) {
  return <Input value={value} onChangeText={onChangeText} placeholder={placeholder} theme={theme} />;
}

export function Loading({ theme, label = "加载中…" }: { theme: PluginTheme; label?: string }) {
  return (
    <View style={{ paddingVertical: 28, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={theme.colors.accent} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function ErrorBox({
  error,
  theme,
  onRetry,
}: {
  error: unknown;
  theme: PluginTheme;
  onRetry?: () => void;
}) {
  return (
    <Card theme={theme} style={{ borderColor: theme.colors.statusDanger }}>
      <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{errorMessage(error)}</Text>
      {onRetry ? <Button label="重试" onPress={onRetry} theme={theme} compact /> : null}
    </Card>
  );
}

export function Empty({
  title,
  hint,
  theme,
  action,
}: {
  title: string;
  hint?: string;
  theme: PluginTheme;
  action?: ReactNode;
}) {
  return (
    <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center", gap: 8 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{title}</Text>
      {hint ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
          {hint}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function KeyValueRows({
  entries,
  theme,
  columns = 1,
}: {
  entries: { label: string; value: unknown }[];
  theme: PluginTheme;
  columns?: number;
}) {
  const visible = entries.filter((entry) => {
    const value = entry.value;
    return value !== null && value !== undefined && value !== "";
  });
  if (visible.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {visible.map((entry) => (
        <View
          key={entry.label}
          style={{
            width: columns > 1 ? `${100 / columns - 2}%` : "100%",
            minWidth: columns > 1 ? 150 : undefined,
            gap: 2,
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{entry.label}</Text>
          <Text selectable style={{ color: theme.colors.foreground, fontSize: 13 }}>
            {entry.label === "优先级"
              ? priorityLabel(entry.value)
              : typeof entry.value === "string"
                ? displayStatus(entry.value)
                : formatValue(entry.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MarkdownBlock({
  text,
  theme,
  maxHeight = 320,
}: {
  text: string;
  theme: PluginTheme;
  maxHeight?: number;
}) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let codeLines: string[] | null = null;
  const flushCode = (key: string) => {
    if (!codeLines || codeLines.length === 0) return;
    blocks.push(
      <View
        key={key}
        style={{
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 6,
          padding: 9,
        }}
      >
        <Text
          selectable
          translate={false}
          style={{
            color: theme.colors.foreground,
            fontFamily: monoFont,
            fontSize: 11,
            lineHeight: 17,
          }}
        >
          {codeLines.join("\n")}
        </Text>
      </View>,
    );
    codeLines = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("```")) {
      if (codeLines === null) codeLines = [];
      else flushCode(`code-${index}`);
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }
    if (line.trim() === "") {
      blocks.push(<View key={`space-${index}`} style={{ height: 5 }} />);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(
        <Text
          key={`heading-${index}`}
          selectable
          translate={false}
          style={{
            color: theme.colors.foreground,
            fontSize: level === 1 ? 18 : level === 2 ? 15 : 13,
            fontWeight: "600",
            lineHeight: level === 1 ? 25 : level === 2 ? 22 : 20,
            marginTop: 4,
          }}
        >
          {cleanInlineMarkdown(heading[2] ?? "")}
        </Text>,
      );
      continue;
    }
    if (/^\s*([-*])\s+/.test(line)) {
      blocks.push(
        <Text
          key={`bullet-${index}`}
          selectable
          translate={false}
          style={{
            color: theme.colors.foreground,
            fontSize: 13,
            lineHeight: 20,
            paddingLeft: 10,
          }}
        >
          • {cleanInlineMarkdown(line.replace(/^\s*([-*])\s+/, ""))}
        </Text>,
      );
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(
        <View
          key={`rule-${index}`}
          style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }}
        />,
      );
      continue;
    }
    blocks.push(
      <Text
        key={`text-${index}`}
        selectable
        translate={false}
        style={{
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {cleanInlineMarkdown(line)}
      </Text>,
    );
  }
  flushCode("code-final");
  return (
    <ScrollView style={{ maxHeight }} nestedScrollEnabled>
      <View style={{ gap: 1 }}>{blocks}</View>
    </ScrollView>
  );
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

export function JsonBlock({
  value,
  theme,
  maxHeight = 360,
  title,
}: {
  value: unknown;
  theme: PluginTheme;
  maxHeight?: number;
  title?: string;
}) {
  const text = useMemo(() => jsonPretty(value), [value]);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {title ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 }}>
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Button
          label={copied ? "已复制" : "复制"}
          theme={theme}
          compact
          onPress={() => {
            void copyText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        />
        <Button
          label={expanded ? "收起" : "展开"}
          theme={theme}
          compact
          onPress={() => setExpanded((value) => !value)}
        />
      </View>
      <ScrollView
        style={{
          maxHeight: expanded ? undefined : maxHeight,
          backgroundColor: theme.colors.surface0,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 10,
        }}
        nestedScrollEnabled
      >
        <Text
          selectable
          translate={false}
          style={{
            color: theme.colors.foreground,
            fontFamily: monoFont,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

export function Divider({ theme }: { theme: PluginTheme }) {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

export function Row({
  children,
  gap = 8,
  wrap = true,
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap,
        flexWrap: wrap ? "wrap" : "nowrap",
      }}
    >
      {children}
    </View>
  );
}
