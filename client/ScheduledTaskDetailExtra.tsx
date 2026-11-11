import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { DetailExtraProps } from "./ResourceSection";
import {
  Badge,
  Button,
  Card,
  Input,
  KeyValueRows,
  Loading,
  MarkdownBlock,
  Row,
  textStyle,
} from "./components";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { callToolRpc } from "../shared/contracts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  displayStatus,
  errorMessage,
  formatDateTime,
  listItems,
} from "./lib";

function formatSize(value: unknown): string {
  const bytes = asNumber(value);
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ScheduledTaskDetailExtra({
  data,
  workspaceId,
  theme,
  compact,
  onChanged,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const taskId = asNumber(data.id);
  const taskVersion = asNumber(data.version);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRunId(null);
    setComment("");
  }, [taskId]);

  const embeddedRuns = useMemo(
    () => asArray(data.recentRuns).map(asRecord),
    [data.recentRuns],
  );
  const runsQuery = useQuery({
    queryKey: ["aw", workspaceId, "scheduled-task-runs", taskId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_scheduled_task_runs",
        arguments: { workspaceId, id: taskId, size: 20 },
      });
      if (response.isError) throw new Error(response.contentText ?? "运行记录加载失败");
      return response.data;
    },
    enabled: taskId !== undefined && embeddedRuns.length === 0,
    retry: 1,
  });
  const runs = embeddedRuns.length > 0 ? embeddedRuns : listItems(runsQuery.data, "list");

  useEffect(() => {
    if (selectedRunId !== null || runs.length === 0) return;
    const first = asNumber(runs[0].id);
    if (first !== undefined) setSelectedRunId(first);
  }, [runs, selectedRunId]);

  const runQuery = useQuery({
    queryKey: ["aw", workspaceId, "scheduled-task-run", selectedRunId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_scheduled_task_run",
        arguments: {
          workspaceId,
          runId: selectedRunId,
          includeEvents: true,
          includeArtifacts: true,
          includeComments: true,
          includeDerivedWorkitems: true,
        },
      });
      if (response.isError) throw new Error(response.contentText ?? "运行详情加载失败");
      return response.data;
    },
    enabled: selectedRunId !== null,
    retry: 1,
  });

  const run = asRecord(runQuery.data);
  const health = asRecord(data.health);
  const documents = asArray(data.documents).map(asRecord);
  const events = asArray(run.events).map(asRecord);
  const artifacts = asArray(run.artifacts).map(asRecord);
  const comments = asArray(run.comments).map(asRecord);
  const derivedWorkitems = asArray(run.derivedWorkitems).map(asRecord);
  const runStatus = asString(run.status);

  async function transition(action: string) {
    if (taskId === undefined || taskVersion === undefined || selectedRunId === null) return;
    setBusy(action);
    try {
      const response = await call({
        name: "autowonder.transition_scheduled_task",
        arguments: {
          workspaceId,
          id: taskId,
          action,
          version: taskVersion,
          runId: selectedRunId,
        },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("操作失败"));
        return;
      }
      toast.show(t("操作已提交"), { variant: "success" });
      void runQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function addComment() {
    const text = comment.trim();
    if (!text || selectedRunId === null) return;
    setBusy("comment");
    try {
      const response = await call({
        name: "autowonder.add_scheduled_task_run_comment",
        arguments: { workspaceId, runId: selectedRunId, contentMd: text },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("评论失败"));
        return;
      }
      toast.show(t("评论已发送"), { variant: "success" });
      setComment("");
      void runQuery.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Card theme={theme}>
        <Row gap={6} wrap>
          <Text style={textStyle(theme, 12, true)}>{t("任务健康")}</Text>
          <Badge label={displayStatus(asString(data.status)) || "—"} theme={theme} />
          {data.scheduleType ? (
            <Badge label={displayStatus(asString(data.scheduleType))} theme={theme} />
          ) : null}
        </Row>
        <KeyValueRows
          columns={compact ? 1 : 2}
          theme={theme}
          entries={[
            { label: "30 天完成", value: health.completed30d },
            { label: "30 天成功", value: health.success30d },
            { label: "下次运行", value: formatDateTime(data.nextFireAt) },
            { label: "上次运行", value: formatDateTime(data.lastFireAt) },
            { label: "时区", value: data.timezone },
            { label: "会话模式", value: displayStatus(asString(data.sessionMode)) },
            { label: "重叠策略", value: displayStatus(asString(data.overlapPolicy)) },
            { label: "错过策略", value: displayStatus(asString(data.misfirePolicy)) },
            {
              label: "Cron",
              value: asString(data.cronExpression) || asString(data.runAt),
            },
            { label: "创建时间", value: formatDateTime(data.gmtCreate) },
          ]}
        />
        {documents.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={textStyle(theme, 11, true)}>{t("任务文档")}</Text>
            {documents.map((document) => (
              <Text key={asString(document.id) || asString(document.name)} style={textStyle(theme, 11)}>
                {asString(document.name) || asString(document.fileName) || `#${asString(document.id)}`}
                {asString(document.type) ? ` · ${asString(document.type)}` : ""}
                {asNumber(document.size) !== undefined ? ` · ${formatSize(document.size)}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <Card theme={theme}>
        <Row gap={6}>
          <Text style={textStyle(theme, 12, true)}>{t("最近运行")}</Text>
          <Badge label={String(runs.length)} theme={theme} tone="accent" />
        </Row>
        {runsQuery.isLoading ? <Loading theme={theme} /> : null}
        {runsQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(runsQuery.error)}
          </Text>
        ) : null}
        {runs.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无运行记录")}</Text>
        ) : (
          runs.map((item) => {
            const id = asNumber(item.id);
            if (id === undefined) return null;
            const selected = id === selectedRunId;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSelectedRunId(id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.surface2 : theme.colors.surface0,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>
                  #{id}
                </Text>
                <Badge label={displayStatus(asString(item.status)) || "—"} theme={theme} />
                <Text style={{ ...textStyle(theme, 11, true), flex: 1 }} numberOfLines={1}>
                  {formatDateTime(item.scheduledAt)}
                </Text>
                <Text style={textStyle(theme, 10, true)}>
                  {formatDateTime(item.finishedAt || item.startedAt)}
                </Text>
              </Pressable>
            );
          })
        )}
      </Card>

      {selectedRunId !== null ? (
        <Card theme={theme}>
          <Row gap={6} wrap>
            <Text style={textStyle(theme, 12, true)}>
              {t("运行详情")} · #{selectedRunId}
            </Text>
            {runStatus ? (
              <Badge label={displayStatus(runStatus)} theme={theme} />
            ) : null}
            <Button
              label={busy === "pause-run" ? "暂停中…" : "暂停运行"}
              theme={theme}
              compact
              icon="Pause"
              disabled={busy !== null || runStatus !== "RUNNING"}
              onPress={() => void transition("pause-run")}
            />
            <Button
              label={busy === "resume-run" ? "恢复中…" : "恢复运行"}
              theme={theme}
              compact
              icon="Play"
              disabled={busy !== null || runStatus !== "PAUSED"}
              onPress={() => void transition("resume-run")}
            />
            <Button
              label={busy === "cancel-run" ? "取消中…" : "取消运行"}
              theme={theme}
              compact
              tone="danger"
              icon="X"
              disabled={busy !== null || !["RUNNING", "PAUSED"].includes(runStatus)}
              onPress={() => void transition("cancel-run")}
            />
          </Row>
          {runQuery.isLoading ? <Loading theme={theme} label="读取运行详情…" /> : null}
          {runQuery.error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
              {errorMessage(runQuery.error)}
            </Text>
          ) : null}
          {!runQuery.isLoading && !runQuery.error ? (
            <>
              <KeyValueRows
                columns={compact ? 1 : 2}
                theme={theme}
                entries={[
                  { label: "触发方式", value: displayStatus(asString(run.triggerType)) },
                  { label: "当前数字员工", value: run.currentAgentId },
                  { label: "SDLC", value: run.sdlcId },
                  { label: "当前步骤", value: run.currentStepId },
                  { label: "计划时间", value: formatDateTime(run.scheduledAt) },
                  { label: "开始时间", value: formatDateTime(run.startedAt) },
                  { label: "结束时间", value: formatDateTime(run.finishedAt) },
                  { label: "降级恢复", value: run.degradedResume === true ? "是" : "" },
                  { label: "降级原因", value: run.degradedReason },
                  { label: "跳过原因", value: run.skipReason },
                ]}
              />
              {asString(run.resultSummary) ? (
                <View style={{ gap: 4 }}>
                  <Text style={textStyle(theme, 11, true)}>{t("结果摘要")}</Text>
                  <MarkdownBlock text={asString(run.resultSummary)} theme={theme} maxHeight={180} />
                </View>
              ) : null}
              {asString(run.error) ? (
                <View style={{ gap: 4 }}>
                  <Text style={textStyle(theme, 11, true)}>{t("错误")}</Text>
                  <Text selectable translate={false} style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
                    {asString(run.error)}
                  </Text>
                </View>
              ) : null}

              <Text style={textStyle(theme, 11, true)}>
                {t("事件时间线")} · {events.length}
              </Text>
              {events.length === 0 ? (
                <Text style={textStyle(theme, 11, true)}>{t("暂无事件")}</Text>
              ) : (
                <View
                  style={{
                    maxHeight: 280,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 8,
                    backgroundColor: theme.colors.surface0,
                  }}
                >
                  <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 8, gap: 6 }}>
                    {events.slice(0, 100).map((event, index) => (
                      <View key={asString(event.id) || String(index)} style={{ gap: 1 }}>
                        <Text style={{ color: theme.colors.foreground, fontSize: 11 }}>
                          {displayStatus(asString(event.eventType)) || "—"}
                          {asString(event.stepName) ? ` · ${asString(event.stepName)}` : ""}
                          {asNumber(event.stepOrder) !== undefined
                            ? ` · #${asNumber(event.stepOrder)}`
                            : ""}
                        </Text>
                        <Text style={textStyle(theme, 10, true)}>
                          {formatDateTime(event.eventTime || event.gmtCreate)}
                        </Text>
                        {asString(event.message) ? (
                          <Text selectable translate={false} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
                            {asString(event.message)}
                          </Text>
                        ) : null}
                        {asString(event.error) ? (
                          <Text selectable translate={false} style={{ color: theme.colors.statusDanger, fontSize: 10 }}>
                            {asString(event.error)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={textStyle(theme, 11, true)}>
                {t("运行产物")} · {artifacts.length}
              </Text>
              {artifacts.length === 0 ? (
                <Text style={textStyle(theme, 11, true)}>{t("暂无运行产物")}</Text>
              ) : (
                artifacts.map((artifact) => (
                  <Text key={asString(artifact.id)} style={textStyle(theme, 11)}>
                    {asString(artifact.name) || `#${asString(artifact.id)}`}
                    {asString(artifact.type) ? ` · ${asString(artifact.type)}` : ""}
                    {asNumber(artifact.size) !== undefined ? ` · ${formatSize(artifact.size)}` : ""}
                  </Text>
                ))
              )}

              <Text style={textStyle(theme, 11, true)}>
                {t("运行评论")} · {comments.length}
              </Text>
              {comments.length === 0 ? (
                <Text style={textStyle(theme, 11, true)}>{t("暂无评论")}</Text>
              ) : (
                comments.map((item) => (
                  <View key={asString(item.id)} style={{ gap: 2 }}>
                    <Text style={textStyle(theme, 10, true)}>
                      {asString(item.authorName) || asString(item.authorType) || t("系统")} ·{" "}
                      {formatDateTime(item.gmtCreate)}
                    </Text>
                    <MarkdownBlock
                      text={asString(item.contentMd) || asString(item.content) || "—"}
                      theme={theme}
                    />
                  </View>
                ))
              )}
              <Row gap={8}>
                <View style={{ flex: 1 }}>
                  <Input
                    value={comment}
                    onChangeText={setComment}
                    placeholder={t("给这次运行补充说明…")}
                    theme={theme}
                    multiline
                  />
                </View>
                <Button
                  label={busy === "comment" ? "发送中…" : "发送评论"}
                  theme={theme}
                  compact
                  icon="Send"
                  disabled={busy !== null || comment.trim() === ""}
                  onPress={() => void addComment()}
                />
              </Row>

              <Text style={textStyle(theme, 11, true)}>
                {t("派生工单")} · {derivedWorkitems.length}
              </Text>
              {derivedWorkitems.length === 0 ? (
                <Text style={textStyle(theme, 11, true)}>{t("暂无派生工单")}</Text>
              ) : (
                derivedWorkitems.map((item) => (
                  <Text key={asString(item.id)} style={textStyle(theme, 11)}>
                    #{asString(item.id)} {asString(item.title)}
                    {asString(item.statusName) ? ` · ${asString(item.statusName)}` : ""}
                  </Text>
                ))
              )}
            </>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}
