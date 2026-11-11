import { useEffect, useState } from "react";
import { View } from "react-native";
import type { DetailExtraProps } from "./ResourceSection";
import { Badge, Button, JsonBlock, MarkdownBlock, Row, textStyle } from "./components";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { asArray, asNumber, asRecord, asString, displayStatus } from "./lib";

function parsedJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const text = asString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function SdlcDetailExtra({ data, theme }: DetailExtraProps) {
  const { t } = useI18n();
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenDetails({});
  }, [data.id]);
  const steps = asArray(data.steps)
    .map(asRecord)
    .sort((a, b) => (asNumber(a.stepOrder) ?? 0) - (asNumber(b.stepOrder) ?? 0));

  if (steps.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <Row gap={6}>
        <Text style={textStyle(theme, 12, true)}>{t("步骤时间线")}</Text>
        <Badge label={String(steps.length)} theme={theme} tone="accent" />
      </Row>
      {steps.map((step, index) => {
        const id = asString(step.id) || String(index);
        const checklist = parsedJson(step.checklistJson);
        const gatePolicy = parsedJson(step.gatePolicyJson);
        const showChecklist = openDetails[`${id}-checklist`] === true;
        const showGate = openDetails[`${id}-gate`] === true;
        const instruction = asString(step.instructionMd);
        const meta = [
          step.handlerType
            ? `${t("处理角色")}: ${displayStatus(asString(step.handlerType))}${
                asString(step.handlerRoleRef) ? ` · ${asString(step.handlerRoleRef)}` : ""
              }`
            : "",
          step.required === true ? t("必填步骤") : "",
          asNumber(step.retryBudget) !== undefined
            ? `${t("重试预算")}: ${asNumber(step.retryBudget)}`
            : "",
          asNumber(step.timeoutSeconds) !== undefined
            ? `${t("超时")}: ${asNumber(step.timeoutSeconds)}s`
            : "",
          asString(step.statusOnEnterCode)
            ? `${t("进入状态")}: ${asString(step.statusOnEnterCode)}`
            : "",
          asString(step.onSuccess)
            ? `${t("成功流转")}: ${displayStatus(asString(step.onSuccess))}`
            : "",
          asString(step.onFail)
            ? `${t("失败处理")}: ${displayStatus(asString(step.onFail))}`
            : "",
        ].filter(Boolean);
        return (
          <View key={id} style={{ flexDirection: "row", gap: 9 }}>
            <View style={{ width: 24, alignItems: "center" }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: theme.colors.accent,
                  backgroundColor: theme.colors.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 10, fontWeight: "600" }}>
                  {asNumber(step.stepOrder) ?? index + 1}
                </Text>
              </View>
              {index < steps.length - 1 ? (
                <View
                  style={{
                    width: 1,
                    flex: 1,
                    minHeight: 18,
                    marginTop: 3,
                    backgroundColor: theme.colors.border,
                  }}
                />
              ) : null}
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
                padding: 10,
                gap: 7,
              }}
            >
              <Row gap={6}>
                <Text
                  translate={false}
                  style={{
                    color: theme.colors.foreground,
                    fontSize: 13,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {asString(step.name) || t("未命名步骤")}
                </Text>
                {asString(step.kind) ? (
                  <Badge label={displayStatus(asString(step.kind))} theme={theme} />
                ) : null}
                {asString(step.code) ? (
                  <Badge label={asString(step.code)} theme={theme} tone="muted" />
                ) : null}
              </Row>
              {meta.length > 0 ? (
                <Text
                  translate={false}
                  style={{ ...textStyle(theme, 10, true), lineHeight: 16 }}
                >
                  {meta.join(" · ")}
                </Text>
              ) : null}
              {instruction ? (
                <View style={{ gap: 4 }}>
                  <Text style={textStyle(theme, 10, true)}>{t("执行指令")}</Text>
                  <MarkdownBlock text={instruction} theme={theme} maxHeight={220} />
                </View>
              ) : null}
              {checklist !== null || gatePolicy !== null ? (
                <Row gap={6} wrap>
                  {checklist !== null ? (
                    <Button
                      label={showChecklist ? t("收起检查清单") : t("查看检查清单")}
                      theme={theme}
                      compact
                      icon={showChecklist ? "ChevronUp" : "ChevronDown"}
                      onPress={() =>
                        setOpenDetails((current) => ({
                          ...current,
                          [`${id}-checklist`]: !showChecklist,
                        }))
                      }
                    />
                  ) : null}
                  {gatePolicy !== null ? (
                    <Button
                      label={showGate ? t("收起门禁策略") : t("查看门禁策略")}
                      theme={theme}
                      compact
                      icon={showGate ? "ChevronUp" : "ChevronDown"}
                      onPress={() =>
                        setOpenDetails((current) => ({
                          ...current,
                          [`${id}-gate`]: !showGate,
                        }))
                      }
                    />
                  ) : null}
                </Row>
              ) : null}
              {showChecklist ? <JsonBlock value={checklist} theme={theme} maxHeight={220} /> : null}
              {showGate ? <JsonBlock value={gatePolicy} theme={theme} maxHeight={220} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
