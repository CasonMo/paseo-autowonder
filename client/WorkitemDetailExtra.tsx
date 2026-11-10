import { useRpc } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { callToolRpc } from "../shared/contracts";
import {
  Button,
  Card,
  Loading,
  MarkdownBlock,
  textStyle,
} from "./components";
import type { DetailExtraProps } from "./ResourceSection";
import { WorkitemDocuments } from "./WorkitemDocuments";
import {
  asNumber,
  asString,
  displayStatus,
  errorMessage,
  formatDateTime,
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
  const [mentionedAgents, setMentionedAgents] = useState<
    { id: number; name: string }[]
  >([]);
  const commentInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const workitemId = asNumber(data.id);

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
