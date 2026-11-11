import { useRpc } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Divider,
  KeyValueRows,
  Loading,
  MarkdownBlock,
  Row,
  textStyle,
} from "./components";
import type { DetailExtraProps } from "./ResourceSection";
import { WorkitemDocuments } from "./WorkitemDocuments";
import {
  asNumber,
  asArray,
  asRecord,
  asString,
  displayStatus,
  errorMessage,
  formatDateTime,
  formatValue,
  listItems,
} from "./lib";

export function WorkitemDetailExtra({
  data,
  workspaceId,
  theme,
  compact,
  onChanged,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [commentSelection, setCommentSelection] = useState({ start: 0, end: 0 });
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [showExecutions, setShowExecutions] = useState(false);
  const [expandedExecution, setExpandedExecution] = useState<number | null>(null);
  const [mentionedAgents, setMentionedAgents] = useState<
    { id: number; name: string }[]
  >([]);
  const commentInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const workitemId = asNumber(data.id);
  useEffect(() => {
    setComment("");
    setMentionedAgents([]);
    setCommentSelection({ start: 0, end: 0 });
    setConfirmKey(null);
    setShowExecutions(false);
    setExpandedExecution(null);
  }, [workitemId]);

  const recoveryQuery = useQuery({
    queryKey: ["aw", workspaceId, "delivery-recovery", workitemId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_delivery_recovery",
        arguments: { workspaceId, workitemId },
      });
      if (response.isError) throw new Error(response.contentText ?? "交付恢复加载失败");
      return response.data;
    },
    enabled: workitemId !== undefined,
    retry: 1,
  });
  const recovery = asRecord(recoveryQuery.data);
  const executions = asArray(recovery.executions).map(asRecord);
  const restarts = asArray(recovery.restarts).map(asRecord);
  const executionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const execution of executions) {
      const status = asString(execution.status) || "UNKNOWN";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => `${displayStatus(status) || status} ${count}`)
      .join(" · ");
  }, [executions]);

  const agentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "agentsForAssign"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_agents",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "数字员工加载失败");
      return response.data;
    },
    retry: 1,
  });

  const commentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "workitem-comments", workitemId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_workitem_comments",
        arguments: { workspaceId, id: workitemId },
      });
      if (response.isError) throw new Error(response.contentText ?? "评论加载失败");
      return response.data;
    },
    enabled: workitemId !== undefined,
    retry: 1,
  });

  const agents = listItems(agentsQuery.data, "items");
  const agentNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const agent of agents) {
      const id = asNumber(agent.id);
      if (id !== undefined) map.set(id, asString(agent.name));
    }
    return map;
  }, [agents]);
  const comments = listItems(commentsQuery.data, "items");
  const mention = useMemo(() => {
    if (commentSelection.start !== commentSelection.end) return null;
    const before = comment.slice(0, commentSelection.start);
    const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("＠"));
    if (at < 0) return null;
    if (at > 0 && /[A-Za-z0-9._-]/.test(before[at - 1])) return null;
    const query = before.slice(at + 1);
    if (/[\s@]/.test(query)) return null;
    return { start: at, end: commentSelection.start, query };
  }, [comment, commentSelection]);
  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.trim().toLowerCase();
    return agents
      .filter((agent) => {
        if (!query) return true;
        const haystack =
          `${asString(agent.name)} ${asString(agent.roleName)} ${asNumber(agent.id) ?? ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [agents, mention]);
  const activeMentions = useMemo(
    () => mentionedAgents.filter((agent) => comment.includes(`@${agent.name}`)),
    [comment, mentionedAgents],
  );

  async function addComment() {
    const text = comment.trim();
    if (!text || workitemId === undefined) return;
    const targetAgentIds = activeMentions.map((agent) => agent.id);
    setBusy("comment");
    try {
      const response = await call({
        name: "autowonder.add_workitem_comment",
        arguments: {
          workspaceId,
          id: workitemId,
          contentMd: text,
          ...(targetAgentIds.length > 0 ? { targetAgentIds } : {}),
        },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("评论失败"));
        return;
      }
      toast.show(t("评论已发送"), { variant: "success" });
      setComment("");
      setMentionedAgents([]);
      setCommentSelection({ start: 0, end: 0 });
      void commentsQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function pauseExecution(dispatchId: number) {
    if (workitemId === undefined) return;
    setBusy(`pause-${dispatchId}`);
    try {
      const response = await call({
        name: "autowonder.pause_dispatch",
        arguments: { workspaceId, workitemId, dispatchId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("暂停失败"));
        return;
      }
      toast.show(t("已提交暂停"), { variant: "success" });
      void recoveryQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deliveryAction(action: string, dispatchId?: number, key?: string) {
    if (workitemId === undefined) return;
    const confirm = key ?? `${action}-${dispatchId ?? "workitem"}`;
    const destructive = ["cancel", "close"].includes(action);
    if (destructive && confirmKey !== confirm) {
      setConfirmKey(confirm);
      toast.show(t("再点一次确认"), { variant: "warning" });
      return;
    }
    setBusy(confirm);
    try {
      const response = await call({
        name: "autowonder.control_delivery",
        arguments: {
          workspaceId,
          workitemId,
          action,
          ...(dispatchId !== undefined ? { dispatchId } : {}),
        },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("操作失败"));
        return;
      }
      toast.show(t("操作已提交"), { variant: "success" });
      setConfirmKey(null);
      void recoveryQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function insertAgentMention(agent: Record<string, unknown>) {
    if (!mention) return;
    const id = asNumber(agent.id);
    if (id === undefined) return;
    const name = asString(agent.name) || "数字员工";
    const token = `@${name} `;
    const next = `${comment.slice(0, mention.start)}${token}${comment.slice(mention.end)}`;
    const cursor = mention.start + token.length;
    setComment(next);
    setCommentSelection({ start: cursor, end: cursor });
    setMentionedAgents((current) =>
      current.some((item) => item.id === id) ? current : [...current, { id, name }],
    );
    requestAnimationFrame(() => commentInputRef.current?.focus());
  }

  if (workitemId === undefined) return null;

  return (
    <View style={{ gap: 10 }}>
      <Card theme={theme}>
        <Row gap={6} wrap>
          <Text style={textStyle(theme, 12, true)}>{t("健康与交付")}</Text>
          <Badge
            label={displayStatus(asString(data.health)) || "—"}
            theme={theme}
            tone={asString(data.health) === "OK" ? "success" : "warning"}
          />
          {data.watched === true ? (
            <Badge label={t("已关注")} theme={theme} tone="accent" />
          ) : null}
          {data.pendingDecision === true ? (
            <Badge label={t("待决策")} theme={theme} tone="warning" />
          ) : null}
        </Row>
        <KeyValueRows
          columns={compact ? 1 : 2}
          theme={theme}
          entries={[
            { label: "健康原因", value: asString(data.healthReason) || undefined },
            { label: "停滞分钟", value: data.healthStalledMinutes },
            { label: "流转警告", value: asString(data.transitionWarning) || undefined },
            { label: "警告码", value: asString(data.transitionWarningCode) || undefined },
            { label: "计划阶段", value: asString(data.scheduledPhase) || undefined },
            {
              label: "计划开始",
              value: asString(data.scheduledStartAt)
                ? formatDateTime(data.scheduledStartAt)
                : undefined,
            },
            {
              label: "实际触发",
              value: asString(data.scheduledStartTriggeredAt)
                ? formatDateTime(data.scheduledStartTriggeredAt)
                : undefined,
            },
            {
              label: "标签",
              value:
                asArray(data.tags)
                  .map(asString)
                  .filter(Boolean)
                  .join(", ") || undefined,
            },
            { label: "来源", value: asString(data.sourceUrl) || undefined },
            {
              label: "最近评论",
              value: asString(data.myLastCommentAt)
                ? formatDateTime(data.myLastCommentAt)
                : undefined,
            },
            {
              label: "外部协作",
              value:
                data.externalCollaboration === undefined
                  ? undefined
                  : formatValue(data.externalCollaboration),
            },
          ]}
        />
      </Card>

      <Card theme={theme}>
        <Row gap={6} wrap>
          <Text style={textStyle(theme, 12, true)}>{t("交付恢复")}</Text>
          {recovery.closed === true ? (
            <Badge label={t("已关闭")} theme={theme} tone="muted" />
          ) : null}
          <Badge label={String(executions.length)} theme={theme} tone="accent" />
          <Button
            label={
              showExecutions
                ? "收起执行记录"
                : t("展开执行记录（{{count}}）", { count: executions.length })
            }
            theme={theme}
            compact
            icon={showExecutions ? "ChevronUp" : "ChevronDown"}
            onPress={() => {
              if (showExecutions) setExpandedExecution(null);
              setShowExecutions((value) => !value);
            }}
          />
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            disabled={recoveryQuery.isFetching}
            onPress={() => void recoveryQuery.refetch()}
          />
          <Button
            label={
              recovery.closed === true
                ? "重新打开"
                : confirmKey === "close-workitem"
                  ? "再点确认"
                  : "关闭工单"
            }
            theme={theme}
            compact
            tone={recovery.closed === true ? "default" : "danger"}
            disabled={busy !== null}
            onPress={() =>
              void deliveryAction(
                recovery.closed === true ? "reopen" : "close",
                undefined,
                recovery.closed === true ? "reopen-workitem" : "close-workitem",
              )
            }
          />
        </Row>
        {executions.length > 0 ? (
          <Text style={textStyle(theme, 10, true)}>
            {executionSummary}
            {restarts.length > 0
              ? ` · ${t("重启记录")} ${restarts.length}`
              : ""}
          </Text>
        ) : null}
        {recoveryQuery.isLoading ? <Loading theme={theme} label="读取交付记录…" /> : null}
        {recoveryQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(recoveryQuery.error)}
          </Text>
        ) : null}
        {executions.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无执行记录")}</Text>
        ) : showExecutions ? (
          executions.map((execution, index) => {
            const dispatchId = asNumber(execution.dispatchId);
            const status = asString(execution.status);
            const active = ["DISPATCHED", "ACKED", "RUNNING"].includes(status);
            const rowKey = dispatchId ?? -index - 1;
            const cancelKey = `cancel-${dispatchId ?? index}`;
            const expanded = expandedExecution === rowKey;
            return (
              <View
                key={String(rowKey)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 7,
                  backgroundColor: theme.colors.surface0,
                  overflow: "hidden",
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() =>
                    setExpandedExecution((current) =>
                      current === rowKey ? null : rowKey,
                    )
                  }
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    padding: 8,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>
                    {t("派发")} #{asString(dispatchId) || "—"}
                  </Text>
                  {status ? <Badge label={displayStatus(status)} theme={theme} /> : null}
                  {asString(execution.phase) ? (
                    <Badge label={asString(execution.phase)} theme={theme} tone="muted" />
                  ) : null}
                  {asNumber(execution.attempt) !== undefined ? (
                    <Text style={textStyle(theme, 10, true)}>
                      {t("尝试")} {asNumber(execution.attempt)}
                    </Text>
                  ) : null}
                  {asString(execution.updatedAt) ? (
                    <Text style={textStyle(theme, 10, true)}>
                      {formatDateTime(execution.updatedAt)}
                    </Text>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Icon
                    name={expanded ? "ChevronUp" : "ChevronDown"}
                    size={13}
                    color={theme.colors.foregroundMuted}
                  />
                </Pressable>
                {expanded ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingBottom: 8,
                      gap: 4,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    <Text style={textStyle(theme, 10, true)}>
                      {t("数字员工")} #{asString(execution.agentId) || "—"}
                      {asString(execution.errorCode)
                        ? ` · ${asString(execution.errorCode)}`
                        : ""}
                    </Text>
                    {asString(execution.error) ? (
                      <Text
                        selectable
                        translate={false}
                        style={{ color: theme.colors.statusDanger, fontSize: 10 }}
                      >
                        {asString(execution.error)}
                      </Text>
                    ) : null}
                    {execution.recovery !== undefined ? (
                      <Text selectable translate={false} style={textStyle(theme, 10, true)}>
                        {formatValue(execution.recovery)}
                      </Text>
                    ) : null}
                    <Row gap={6} wrap>
                      {active && dispatchId !== undefined ? (
                        <Button
                          label={busy === `pause-${dispatchId}` ? "暂停中…" : "暂停"}
                          theme={theme}
                          compact
                          icon="Pause"
                          disabled={busy !== null}
                          onPress={() => void pauseExecution(dispatchId)}
                        />
                      ) : null}
                      {execution.retryable === true && dispatchId !== undefined ? (
                        <Button
                          label={busy === `retry-${dispatchId}` ? "重试中…" : "重试"}
                          theme={theme}
                          compact
                          icon="RefreshCw"
                          disabled={busy !== null}
                          onPress={() => void deliveryAction("retry", dispatchId)}
                        />
                      ) : null}
                      {active && dispatchId !== undefined ? (
                        <Button
                          label={confirmKey === cancelKey ? "再点确认" : "取消"}
                          theme={theme}
                          compact
                          tone="danger"
                          icon="X"
                          disabled={busy !== null}
                          onPress={() => void deliveryAction("cancel", dispatchId)}
                        />
                      ) : null}
                    </Row>
                  </View>
                ) : null}
              </View>
            );
          })
        ) : null}
        {restarts.length > 0 ? (
          <View style={{ gap: 3 }}>
            <Divider theme={theme} />
            <Text style={textStyle(theme, 11, true)}>
              {t("重启记录")} · {restarts.length}
            </Text>
            {restarts.map((restart, index) => (
              <Text
                key={String(asString(restart.id) || index)}
                selectable
                translate={false}
                style={textStyle(theme, 10, true)}
              >
                {formatValue(restart)}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <WorkitemDocuments
        workspaceId={workspaceId}
        workitemId={workitemId}
        theme={theme}
        compact={compact}
        onChanged={onChanged}
      />

      <Card theme={theme}>
        <Text style={textStyle(theme, 12, true)}>评论 & 时间线</Text>
        <TextInput
          ref={commentInputRef}
          value={comment}
          onChangeText={setComment}
          onSelectionChange={(event) => {
            setCommentSelection(event.nativeEvent.selection);
          }}
          multiline
          placeholder={t("输入 Markdown 评论，输入 @ 提及数字员工…")}
          placeholderTextColor={theme.colors.foregroundMuted}
          style={{
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface0,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            padding: 10,
            minHeight: 88,
            fontSize: 12,
            textAlignVertical: "top",
          }}
        />
        {mention ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 8,
              backgroundColor: theme.colors.surface1,
              padding: 5,
              gap: 2,
            }}
          >
            {agentsQuery.isLoading ? (
              <Text style={textStyle(theme, 11, true)}>数字员工加载中…</Text>
            ) : mentionMatches.length === 0 ? (
              <Text style={textStyle(theme, 11, true)}>没有匹配的数字员工</Text>
            ) : (
              mentionMatches.map((agent) => {
                const id = asNumber(agent.id);
                if (id === undefined) return null;
                const name = asString(agent.name) || t("数字员工");
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={t("提及数字员工 {{name}} #{{id}}", {
                      name,
                      id,
                    })}
                    onPress={() => insertAgentMention(agent)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      borderRadius: 6,
                      backgroundColor: pressed ? theme.colors.surface2 : "transparent",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    })}
                  >
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text
                        translate={false}
                        style={{ color: theme.colors.foreground, fontSize: 12 }}
                      >
                        {name} #{id}
                      </Text>
                      <Text translate={false} style={textStyle(theme, 10, true)}>
                        {asString(agent.roleName) || t("数字员工")} ·{" "}
                        {t(displayStatus(asString(agent.status))) || "—"}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.accent, fontSize: 11 }}>提及</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
        {activeMentions.length > 0 ? (
          <Text style={textStyle(theme, 10, true)}>
            {t("将通知：{{names}}", {
              names: activeMentions
                .map((agent) => `${agent.name} #${agent.id}`)
                .join(", "),
            })}
          </Text>
        ) : null}
        <Button
          label={busy === "comment" ? "发送中…" : "发送评论"}
          theme={theme}
          tone="primary"
          compact
          icon={busy === "comment" ? undefined : "Send"}
          disabled={busy !== null || comment.trim() === ""}
          onPress={() => void addComment()}
        />
        {commentsQuery.isLoading ? <Loading theme={theme} label="读取评论…" /> : null}
        {commentsQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(commentsQuery.error)}
          </Text>
        ) : null}
        {!commentsQuery.isLoading && !commentsQuery.error && comments.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>暂无评论。</Text>
        ) : null}
        {comments.map((entry, index) => {
          const authorType = asString(entry.authorType);
          const authorRef = asNumber(entry.authorRef);
          const name =
            authorType === "AGENT" ? agentNames.get(authorRef ?? -1) : undefined;
          const isAgent = authorType === "AGENT";
          const isHuman = authorType === "HUMAN";
          const authorName =
            name?.trim() || (isAgent ? "数字员工" : isHuman ? "真人" : authorType || "系统");
          const kindLabel = isAgent ? "数字员工" : isHuman ? "真人" : "系统";
          const kindColor = isAgent ? theme.colors.accent : theme.colors.foregroundMuted;
          return (
            <View
              key={String(entry.id)}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                backgroundColor:
                  index % 2 === 0 ? theme.colors.surface2 : theme.colors.surface1,
                borderRadius: 8,
                padding: 10,
                gap: 7,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: kindColor,
                    backgroundColor: theme.colors.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: kindColor, fontSize: 11, fontWeight: "600" }}>
                    {authorName.slice(0, 1) || "?"}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.foreground,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {authorName}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: kindColor,
                    }}
                  >
                    <Text style={{ color: kindColor, fontSize: 9 }}>{kindLabel}</Text>
                  </View>
                  {authorRef !== undefined ? (
                    <Text style={textStyle(theme, 10, true)}>#{authorRef}</Text>
                  ) : null}
                </View>
                <Text style={textStyle(theme, 10, true)}>
                  {formatDateTime(entry.gmtCreate)}
                </Text>
              </View>
              <View style={{ paddingLeft: 32 }}>
                <MarkdownBlock text={asString(entry.contentMd) || "—"} theme={theme} />
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}
