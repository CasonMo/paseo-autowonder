import { useRpc } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  ErrorBox,
  JsonBlock,
  Loading,
  Row,
  monoFont,
  textStyle,
} from "./components";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  errorMessage,
  formatDateTime,
  formatValue,
} from "./lib";

export type DispatchInspectorTab = "activities" | "trace" | "diagnostics";

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined || milliseconds < 0) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function levelTone(
  level: string,
): "danger" | "warning" | "accent" | "muted" {
  switch (level.toUpperCase()) {
    case "ERROR":
    case "FATAL":
      return "danger";
    case "WARN":
    case "WARNING":
      return "warning";
    case "INFO":
      return "accent";
    default:
      return "muted";
  }
}

function levelColor(theme: PluginTheme, level: string): string {
  const tone = levelTone(level);
  if (tone === "danger") return theme.colors.statusDanger;
  if (tone === "warning") return theme.colors.statusWarning;
  if (tone === "accent") return theme.colors.accent;
  return theme.colors.foregroundMuted;
}

function TimelineDot({
  theme,
  color,
  last,
}: {
  theme: PluginTheme;
  color: string;
  last: boolean;
}) {
  return (
    <View style={{ width: 9, alignItems: "center" }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          marginTop: 4,
        }}
      />
      {last ? null : (
        <View
          style={{
            width: 1,
            flex: 1,
            backgroundColor: theme.colors.border,
            marginTop: 3,
          }}
        />
      )}
    </View>
  );
}

export function DispatchInspectorModal({
  open,
  initialTab,
  workspaceId,
  dispatchId,
  workitemId,
  status,
  theme,
  onClose,
}: {
  open: boolean;
  initialTab: DispatchInspectorTab;
  workspaceId: number;
  dispatchId: number;
  workitemId?: number;
  status?: string;
  theme: PluginTheme;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const [tab, setTab] = useState<DispatchInspectorTab>(initialTab);
  const [showRaw, setShowRaw] = useState(false);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<
    Record<string, unknown> | null
  >(null);
  const [diagnosticText, setDiagnosticText] = useState("");
  const [diagnosticNextOffset, setDiagnosticNextOffset] = useState<number | null>(
    null,
  );
  const [diagnosticTotal, setDiagnosticTotal] = useState(0);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const activitiesQuery = useQuery({
    queryKey: ["aw", workspaceId, "dispatch-activities", dispatchId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_dispatch_activities",
        arguments: { workspaceId, dispatchId },
      });
      if (response.isError) throw new Error(response.contentText ?? "活动加载失败");
      return response.data;
    },
    enabled: open && tab === "activities",
    retry: 1,
  });

  const traceQuery = useQuery({
    queryKey: ["aw", workspaceId, "dispatch-trace", dispatchId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_dispatch_runtime_trace",
        arguments: { workspaceId, dispatchId },
      });
      if (response.isError) throw new Error(response.contentText ?? "轨迹加载失败");
      return response.data;
    },
    enabled: open && tab === "trace",
    retry: 1,
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["aw", workspaceId, "dispatch-diagnostics", dispatchId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_dispatch_diagnostics",
        arguments: { workspaceId, dispatchId },
      });
      if (response.isError) throw new Error(response.contentText ?? "诊断列表加载失败");
      return response.data;
    },
    enabled: open && tab === "diagnostics",
    retry: 1,
  });

  const activities = useMemo(
    () => asArray(asRecord(activitiesQuery.data).activities).map(asRecord),
    [activitiesQuery.data],
  );
  const trace = asRecord(traceQuery.data);
  const traceEvents = useMemo(
    () => asArray(trace.events).map(asRecord),
    [trace.events],
  );
  const traceSessions = useMemo(
    () => asArray(trace.sessions).map(asRecord),
    [trace.sessions],
  );
  const diagnostics = useMemo(
    () => asArray(asRecord(diagnosticsQuery.data).items).map(asRecord),
    [diagnosticsQuery.data],
  );

  async function loadDiagnostic(
    item: Record<string, unknown>,
    offset: number,
    append: boolean,
  ) {
    const artifactId = asNumber(item.id);
    if (artifactId === undefined) return;
    if (!append) {
      setDiagnosticText("");
      setDiagnosticNextOffset(null);
      setDiagnosticTotal(0);
    }
    setSelectedDiagnostic(item);
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const response = await call({
        name: "autowonder.read_dispatch_diagnostic",
        arguments: {
          workspaceId,
          dispatchId,
          artifactId,
          offset,
          limit: 16000,
        },
      });
      if (response.isError) {
        throw new Error(response.contentText ?? "诊断内容加载失败");
      }
      const record = asRecord(response.data);
      const text = asString(record.text);
      const nextOffset = asNumber(record.nextOffset);
      setDiagnosticText((current) => (append ? current + text : text));
      setDiagnosticNextOffset(
        nextOffset !== undefined && nextOffset > 0 ? nextOffset : null,
      );
      setDiagnosticTotal(asNumber(record.totalChars) ?? 0);
    } catch (error) {
      setDiagnosticError(errorMessage(error));
    } finally {
      setDiagnosticLoading(false);
    }
  }

  function backToDiagnostics() {
    setSelectedDiagnostic(null);
    setDiagnosticText("");
    setDiagnosticNextOffset(null);
    setDiagnosticTotal(0);
    setDiagnosticError(null);
  }

  const activeQuery =
    tab === "activities"
      ? activitiesQuery
      : tab === "trace"
        ? traceQuery
        : diagnosticsQuery;
  const parsedDiagnostic = useMemo(() => {
    if (!diagnosticText) return undefined;
    try {
      return JSON.parse(diagnosticText) as unknown;
    } catch {
      return undefined;
    }
  }, [diagnosticText]);

  function refreshActive() {
    if (tab === "diagnostics" && selectedDiagnostic) {
      void loadDiagnostic(selectedDiagnostic, 0, false);
      return;
    }
    void activeQuery.refetch();
  }

  return (
    <Modal
      title={t("派发 #{{id}}", { id: dispatchId })}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <Row gap={6} wrap>
            {status ? <Badge label={status} theme={theme} /> : null}
            {workitemId !== undefined ? (
              <Text style={textStyle(theme, 11, true)}>
                {t("工单 #{{id}}", { id: workitemId })}
              </Text>
            ) : null}
            <Button
              label="刷新"
              theme={theme}
              compact
              icon="RefreshCw"
              disabled={activeQuery.isFetching || diagnosticLoading}
              onPress={refreshActive}
            />
          </Row>

          <Row gap={6} wrap>
            <Chip
              label="活动"
              active={tab === "activities"}
              theme={theme}
              onPress={() => {
                setTab("activities");
                setShowRaw(false);
              }}
            />
            <Chip
              label="轨迹"
              active={tab === "trace"}
              theme={theme}
              onPress={() => {
                setTab("trace");
                setShowRaw(false);
              }}
            />
            <Chip
              label="诊断"
              active={tab === "diagnostics"}
              theme={theme}
              onPress={() => {
                setTab("diagnostics");
                setShowRaw(false);
                backToDiagnostics();
              }}
            />
          </Row>

          {tab === "activities" ? (
            <View style={{ gap: 10 }}>
              {activitiesQuery.isLoading ? (
                <Loading theme={theme} label="读取活动记录…" />
              ) : null}
              {activitiesQuery.error ? (
                <ErrorBox
                  error={activitiesQuery.error}
                  theme={theme}
                  onRetry={() => void activitiesQuery.refetch()}
                />
              ) : null}
              {!activitiesQuery.isLoading && !activitiesQuery.error ? (
                activities.length === 0 ? (
                  <Text style={textStyle(theme, 12, true)}>暂无活动记录。</Text>
                ) : (
                  <Card theme={theme}>
                    {activities.map((activity, index) => {
                      const level = asString(activity.level);
                      return (
                        <View
                          key={asString(activity.eventId) || index}
                          style={{ flexDirection: "row", gap: 9 }}
                        >
                          <TimelineDot
                            theme={theme}
                            color={levelColor(theme, level)}
                            last={index === activities.length - 1}
                          />
                          <View style={{ flex: 1, gap: 4, paddingBottom: 12 }}>
                            <Row gap={6} wrap>
                              <Badge
                                label={asString(activity.eventType) || "event"}
                                theme={theme}
                                tone={levelTone(level)}
                              />
                              {level ? (
                                <Text style={textStyle(theme, 10, true)}>{level}</Text>
                              ) : null}
                              <Text style={textStyle(theme, 10, true)}>
                                {formatDateTime(activity.eventTime)}
                              </Text>
                              {asNumber(activity.seq) !== undefined ? (
                                <Text style={textStyle(theme, 10, true)}>
                                  #{asNumber(activity.seq)}
                                </Text>
                              ) : null}
                            </Row>
                            <Text
                              selectable
                              style={{
                                color: theme.colors.foreground,
                                fontSize: 12,
                                lineHeight: 18,
                              }}
                            >
                              {asString(activity.content) || "—"}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                )
              ) : null}
            </View>
          ) : null}

          {tab === "trace" ? (
            <View style={{ gap: 10 }}>
              {traceQuery.isLoading ? (
                <Loading theme={theme} label="读取运行轨迹…" />
              ) : null}
              {traceQuery.error ? (
                <ErrorBox
                  error={traceQuery.error}
                  theme={theme}
                  onRetry={() => void traceQuery.refetch()}
                />
              ) : null}
              {!traceQuery.isLoading && !traceQuery.error ? (
                <>
                  <Card theme={theme}>
                    <Row gap={6} wrap>
                      <Badge
                        label={
                          asString(trace.source) === "OSS"
                            ? "归档轨迹"
                            : asString(trace.source) === "LIVE"
                              ? "实时轨迹"
                              : asString(trace.source) || "轨迹"
                        }
                        theme={theme}
                        tone="accent"
                      />
                      {asString(trace.provider) ? (
                        <Badge label={asString(trace.provider)} theme={theme} />
                      ) : null}
                      <Text style={textStyle(theme, 11, true)}>
                        {t("事件 {{events}} · 会话 {{sessions}}", {
                          events: traceEvents.length,
                          sessions: traceSessions.length,
                        })}
                      </Text>
                      {asNumber(trace.lastSeq) !== undefined ? (
                        <Text style={textStyle(theme, 11, true)}>
                          lastSeq {asNumber(trace.lastSeq)}
                        </Text>
                      ) : null}
                    </Row>
                    {asString(trace.runtimeId) ? (
                      <Text
                        selectable
                        style={{ ...textStyle(theme, 10, true), fontFamily: monoFont }}
                      >
                        {asString(trace.runtimeId)}
                      </Text>
                    ) : null}
                  </Card>

                  <Text style={textStyle(theme, 12, true)}>运行事件</Text>
                  {traceEvents.length === 0 ? (
                    <Text style={textStyle(theme, 11, true)}>暂无运行事件。</Text>
                  ) : (
                    <Card theme={theme}>
                      {traceEvents.map((event, index) => {
                        const detail = asRecord(event.detail);
                        const entries = Object.entries(detail).filter(
                          ([, value]) =>
                            value !== null && value !== undefined && value !== "",
                        );
                        return (
                          <View
                            key={asString(event.eventId) || index}
                            style={{ flexDirection: "row", gap: 9 }}
                          >
                            <TimelineDot
                              theme={theme}
                              color={theme.colors.accent}
                              last={index === traceEvents.length - 1}
                            />
                            <View style={{ flex: 1, gap: 5, paddingBottom: 12 }}>
                              <Row gap={6} wrap>
                                <Badge
                                  label={asString(event.eventType) || "event"}
                                  theme={theme}
                                  tone="accent"
                                />
                                <Text style={textStyle(theme, 10, true)}>
                                  {formatDateTime(event.eventTime)}
                                </Text>
                              </Row>
                              {entries.length > 0 ? (
                                <View
                                  style={{
                                    backgroundColor: theme.colors.surface0,
                                    borderRadius: 6,
                                    padding: 8,
                                    gap: 3,
                                  }}
                                >
                                  {entries.slice(0, 8).map(([key, value]) => (
                                    <View
                                      key={key}
                                      style={{ flexDirection: "row", gap: 6 }}
                                    >
                                      <Text
                                        numberOfLines={1}
                                        style={{
                                          ...textStyle(theme, 10, true),
                                          width: 100,
                                        }}
                                      >
                                        {key}
                                      </Text>
                                      <Text
                                        selectable
                                        numberOfLines={3}
                                        style={{
                                          color:
                                            key === "error"
                                              ? theme.colors.statusDanger
                                              : theme.colors.foreground,
                                          fontSize: 10,
                                          lineHeight: 15,
                                          flex: 1,
                                        }}
                                      >
                                        {formatValue(value)}
                                      </Text>
                                    </View>
                                  ))}
                                  {entries.length > 8 ? (
                                    <Text style={textStyle(theme, 10, true)}>
                                      {t("还有 {{count}} 个字段", {
                                        count: entries.length - 8,
                                      })}
                                    </Text>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </Card>
                  )}

                  <Text style={textStyle(theme, 12, true)}>会话与 Turn</Text>
                  {traceSessions.length === 0 ? (
                    <Text style={textStyle(theme, 11, true)}>暂无会话信息。</Text>
                  ) : (
                    traceSessions.map((session, index) => {
                      const turns = asArray(session.turns).map(asRecord);
                      const boundaries = asArray(session.boundaries).map(asRecord);
                      const duration = asNumber(session.durationMs);
                      return (
                        <Card
                          key={asString(session.sessionId) || index}
                          theme={theme}
                        >
                          <Row gap={6} wrap>
                            <Badge
                              label={asString(session.status) || "—"}
                              theme={theme}
                            />
                            {asString(session.provider) ? (
                              <Text style={textStyle(theme, 11, true)}>
                                {asString(session.provider)}
                              </Text>
                            ) : null}
                            <Text style={textStyle(theme, 10, true)}>
                              {asString(session.sessionId).slice(0, 8) || "—"}
                            </Text>
                            {duration !== undefined ? (
                              <Text style={textStyle(theme, 11, true)}>
                                {formatDuration(duration)}
                              </Text>
                            ) : null}
                          </Row>
                          <Row gap={10} wrap>
                            <Text style={textStyle(theme, 10, true)}>
                              {t("开始 {{time}}", {
                                time: formatDateTime(session.startedAt),
                              })}
                            </Text>
                            <Text style={textStyle(theme, 10, true)}>
                              {t("结束 {{time}}", {
                                time: formatDateTime(session.endedAt),
                              })}
                            </Text>
                            {boundaries.length > 0 ? (
                              <Text style={textStyle(theme, 10, true)}>
                                {t("恢复节点 {{count}}", {
                                  count: boundaries.length,
                                })}
                              </Text>
                            ) : null}
                            <Text style={textStyle(theme, 10, true)}>
                              Turn {turns.length}
                            </Text>
                          </Row>
                          {boundaries.length > 0 ? (
                            <Row gap={6}>
                              {boundaries.slice(0, 4).map((boundary, boundaryIndex) => (
                                <Badge
                                  key={boundaryIndex}
                                  label={`${asString(boundary.type) || "BOUNDARY"} ${formatDateTime(boundary.time)}`}
                                  theme={theme}
                                  tone="warning"
                                />
                              ))}
                            </Row>
                          ) : null}
                          {turns.length > 0 ? (
                            <View style={{ gap: 7 }}>
                              <Divider theme={theme} />
                              {turns.map((turn, turnIndex) => (
                                <View
                                  key={asString(turn.traceId) || turnIndex}
                                  style={{
                                    borderTopWidth: turnIndex === 0 ? 0 : 1,
                                    borderTopColor: theme.colors.border,
                                    paddingTop: turnIndex === 0 ? 0 : 8,
                                    gap: 4,
                                  }}
                                >
                                  <Row gap={6} wrap>
                                    <Badge
                                      label={asString(turn.status) || "—"}
                                      theme={theme}
                                    />
                                    <Text
                                      style={{
                                        color: theme.colors.foreground,
                                        fontFamily: monoFont,
                                        fontSize: 10,
                                      }}
                                    >
                                      {asString(turn.traceId) || "—"}
                                    </Text>
                                    {asNumber(turn.durationMs) !== undefined ? (
                                      <Text style={textStyle(theme, 10, true)}>
                                        {formatDuration(asNumber(turn.durationMs))}
                                      </Text>
                                    ) : null}
                                  </Row>
                                  <Row gap={8} wrap>
                                    {asString(turn.stepName) ? (
                                      <Text style={textStyle(theme, 10, true)}>
                                        {t("步骤 {{name}}", {
                                          name: asString(turn.stepName),
                                        })}
                                      </Text>
                                    ) : null}
                                    {asString(turn.providerCoverage) ? (
                                      <Text style={textStyle(theme, 10, true)}>
                                        {t("覆盖 {{coverage}}", {
                                          coverage: asString(turn.providerCoverage),
                                        })}
                                      </Text>
                                    ) : null}
                                    <Text style={textStyle(theme, 10, true)}>
                                      {formatDateTime(turn.startedAt)} →{" "}
                                      {formatDateTime(turn.endedAt)}
                                    </Text>
                                  </Row>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={textStyle(theme, 10, true)}>
                              暂无 Turn 明细。
                            </Text>
                          )}
                        </Card>
                      );
                    })
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          {tab === "diagnostics" ? (
            <View style={{ gap: 10 }}>
              {diagnosticsQuery.isLoading ? (
                <Loading theme={theme} label="读取诊断列表…" />
              ) : null}
              {diagnosticsQuery.error ? (
                <ErrorBox
                  error={diagnosticsQuery.error}
                  theme={theme}
                  onRetry={() => void diagnosticsQuery.refetch()}
                />
              ) : null}
              {!diagnosticsQuery.isLoading && !diagnosticsQuery.error ? (
                selectedDiagnostic ? (
                  <Card theme={theme}>
                    <Row gap={8} wrap>
                      <Text
                        selectable
                        style={{
                          color: theme.colors.foreground,
                          fontSize: 12,
                          fontWeight: "600",
                          flex: 1,
                        }}
                      >
                        {asString(selectedDiagnostic.name) ||
                          t("诊断 #{{id}}", {
                            id: asNumber(selectedDiagnostic.id) ?? "—",
                          })}
                      </Text>
                      <Button
                        label="返回"
                        theme={theme}
                        compact
                        onPress={backToDiagnostics}
                      />
                    </Row>
                    <Text style={textStyle(theme, 10, true)}>
                      {formatBytes(asNumber(selectedDiagnostic.sizeBytes))} ·{" "}
                      {diagnosticTotal > 0
                        ? t("{{current}} / {{total}} 字符", {
                            current: diagnosticText.length,
                            total: diagnosticTotal,
                          })
                        : t("{{count}} 字符", {
                            count: diagnosticText.length,
                          })}
                    </Text>
                    {diagnosticLoading ? (
                      <Loading theme={theme} label="读取诊断内容…" />
                    ) : null}
                    {diagnosticError ? (
                      <ErrorBox
                        error={new Error(diagnosticError)}
                        theme={theme}
                        onRetry={() =>
                          void loadDiagnostic(selectedDiagnostic, 0, false)
                        }
                      />
                    ) : null}
                    {!diagnosticLoading && !diagnosticError ? (
                      parsedDiagnostic !== undefined ? (
                        <JsonBlock
                          value={parsedDiagnostic}
                          theme={theme}
                          maxHeight={360}
                        />
                      ) : (
                        <View
                          style={{
                            backgroundColor: theme.colors.surface0,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <Text
                            selectable
                            style={{
                              color: theme.colors.foreground,
                              fontFamily: monoFont,
                              fontSize: 11,
                              lineHeight: 16,
                            }}
                          >
                            {diagnosticText || "（空）"}
                          </Text>
                        </View>
                      )
                    ) : null}
                    {!diagnosticLoading &&
                    !diagnosticError &&
                    diagnosticNextOffset !== null ? (
                      <Button
                        label="加载更多"
                        theme={theme}
                        compact
                        onPress={() =>
                          void loadDiagnostic(
                            selectedDiagnostic,
                            diagnosticNextOffset,
                            true,
                          )
                        }
                      />
                    ) : null}
                  </Card>
                ) : diagnostics.length === 0 ? (
                  <Text style={textStyle(theme, 12, true)}>
                    暂无诊断快照。旧版本运行时可能不支持诊断采集。
                  </Text>
                ) : (
                  <View style={{ gap: 7 }}>
                    {diagnostics.map((item, index) => (
                      <Card
                        key={asNumber(item.id) ?? index}
                        theme={theme}
                      >
                        <Row gap={8} wrap>
                          <Text
                            selectable
                            style={{
                              color: theme.colors.foreground,
                              fontSize: 12,
                              flex: 1,
                            }}
                          >
                            {asString(item.name) || `诊断 #${index + 1}`}
                          </Text>
                          <Text style={textStyle(theme, 10, true)}>
                            {formatBytes(asNumber(item.sizeBytes))}
                          </Text>
                          <Button
                            label="查看"
                            theme={theme}
                            compact
                            onPress={() => void loadDiagnostic(item, 0, false)}
                          />
                        </Row>
                      </Card>
                    ))}
                  </View>
                )
              ) : null}
            </View>
          ) : null}

          <Divider theme={theme} />
          <Row gap={8}>
            <Button
              label={showRaw ? "收起原始 JSON" : "查看原始 JSON"}
              theme={theme}
              compact
              icon="Code"
              onPress={() => setShowRaw((value) => !value)}
            />
            <Button
              label="关闭"
              theme={theme}
              compact
              icon="X"
              onPress={onClose}
            />
          </Row>
          {showRaw ? (
            <JsonBlock
              value={
                tab === "activities"
                  ? activitiesQuery.data
                  : tab === "trace"
                    ? traceQuery.data
                    : selectedDiagnostic
                      ? {
                          diagnostic: selectedDiagnostic,
                          text: diagnosticText,
                        }
                      : diagnosticsQuery.data
              }
              theme={theme}
              maxHeight={360}
            />
          ) : null}
        </View>
      </Modal.Content>
    </Modal>
  );
}
