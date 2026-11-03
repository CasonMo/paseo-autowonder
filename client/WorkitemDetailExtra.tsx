import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Input,
  LabeledField,
  Loading,
  MarkdownBlock,
  Row,
  textStyle,
} from "./components";
import type { DetailExtraProps } from "./ResourceSection";
import { WorkitemDocuments } from "./WorkitemDocuments";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
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
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [humanId, setHumanId] = useState("");
  const [confirmNodeId, setConfirmNodeId] = useState<number | null>(null);

  const workitemId = asNumber(data.id);
  const templateId = asNumber(data.templateId);
  const currentStatusNodeId = asNumber(data.statusNodeId);
  const workType = asString(data.workType);

  const templateQuery = useQuery({
    queryKey: ["aw", workspaceId, "statusTemplate", templateId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_status_template",
        arguments: { workspaceId, id: templateId },
      });
      if (response.isError) throw new Error(response.contentText ?? "状态模板加载失败");
      return response.data;
    },
    enabled: templateId !== undefined,
    retry: 1,
  });

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

  const template = asRecord(templateQuery.data);
  const nodes = useMemo(
    () => asArray(template.nodes).map(asRecord),
    [template.nodes],
  );
  const nodeName = useMemo(() => {
    const map = new Map<number, string>();
    for (const node of nodes) {
      const id = asNumber(node.id);
      if (id !== undefined) map.set(id, asString(node.name));
    }
    return map;
  }, [nodes]);
  const nextNodes = useMemo(() => {
    if (currentStatusNodeId === undefined) return [];
    const transitions = asArray(template.transitions).map(asRecord);
    const seen = new Set<number>();
    const result: Record<string, unknown>[] = [];
    for (const transition of transitions) {
      if (asNumber(transition.fromNodeId) !== currentStatusNodeId) continue;
      const targetId = asNumber(transition.toNodeId);
      if (targetId === undefined || seen.has(targetId)) continue;
      seen.add(targetId);
      result.push({
        id: targetId,
        name: nodeName.get(targetId) ?? `节点 #${targetId}`,
        category: asString(asRecord(nodes.find((node) => asNumber(node.id) === targetId)).category),
        transitionName: asString(transition.name),
      });
    }
    return result;
  }, [template.transitions, currentStatusNodeId, nodeName, nodes]);

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

  async function transition(toNodeId: number, label: string) {
    if (workitemId === undefined) return;
    setBusy(`transition-${toNodeId}`);
    try {
      const response = await call({
        name: "autowonder.transition_workitem",
        arguments: { workspaceId, id: workitemId, toNodeId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? "流转失败");
        return;
      }
      toast.show(`已流转到「${label}」`, { variant: "success" });
      setConfirmNodeId(null);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function assignToAgent(agentId: number, agentName: string) {
    if (workitemId === undefined) return;
    setBusy(`assign-${agentId}`);
    try {
      const response = await call({
        name: "autowonder.assign_workitem",
        arguments: {
          workspaceId,
          id: workitemId,
          assigneeType: "AGENT",
          assigneeRef: agentId,
        },
      });
      if (response.isError) {
        toast.error(response.contentText ?? "指派失败");
        return;
      }
      toast.show(`已指派给 ${agentName}`, { variant: "success" });
      setAssignOpen(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function assignToHumanId(id: number, label?: string) {
    if (workitemId === undefined) return;
    setBusy("assign-human");
    try {
      const response = await call({
        name: "autowonder.assign_workitem",
        arguments: {
          workspaceId,
          id: workitemId,
          assigneeType: "HUMAN",
          assigneeRef: Math.trunc(id),
        },
      });
      if (response.isError) {
        toast.error(response.contentText ?? "指派失败");
        return;
      }
      toast.show(`已指派给 ${label ?? `真人 #${id}`}`, { variant: "success" });
      setHumanId("");
      setAssignOpen(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function assignToHuman() {
    const id = Number(humanId.trim());
    if (!Number.isFinite(id) || id <= 0) {
      toast.error("请填写有效的用户 ID");
      return;
    }
    await assignToHumanId(Math.trunc(id));
  }

  async function addComment() {
    const text = comment.trim();
    if (!text || workitemId === undefined) return;
    setBusy("comment");
    try {
      const response = await call({
        name: "autowonder.add_workitem_comment",
        arguments: { workspaceId, id: workitemId, contentMd: text },
      });
      if (response.isError) {
        toast.error(response.contentText ?? "评论失败");
        return;
      }
      toast.show("评论已发送", { variant: "success" });
      setComment("");
      void commentsQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (workitemId === undefined) return null;

  return (
    <View style={{ gap: 10 }}>
      <Card theme={theme}>
        <Row gap={8}>
          <Text style={textStyle(theme, 12, true)}>状态流转</Text>
          {asString(data.statusName) ? (
            <Badge label={asString(data.statusName)} theme={theme} />
          ) : null}
          {workType ? <Badge label={workType} theme={theme} tone="muted" /> : null}
        </Row>
        {templateQuery.isLoading ? <Loading theme={theme} label="读取状态模板…" /> : null}
        {templateQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(templateQuery.error)}
          </Text>
        ) : null}
        {!templateQuery.isLoading && nextNodes.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>当前状态没有可用的流转目标。</Text>
        ) : null}
        <Row gap={6}>
          {nextNodes.map((node) => {
            const id = asNumber(node.id) ?? 0;
            const name = asString(node.name);
            const danger = asString(node.category) === "CANCELED";
            const pending = confirmNodeId === id;
            return (
              <Chip
                key={id}
                label={
                  busy === `transition-${id}`
                    ? "处理中…"
                    : pending
                      ? `确认${name}`
                      : name
                }
                theme={theme}
                disabled={busy !== null}
                onPress={() => {
                  if (danger && !pending) {
                    setConfirmNodeId(id);
                    return;
                  }
                  void transition(id, name);
                }}
              />
            );
          })}
        </Row>
        {nextNodes.some((node) => asString(node.category) === "CANCELED") &&
        confirmNodeId !== null ? (
          <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
            取消类流转不可逆，再点一次确认执行。
          </Text>
        ) : null}
      </Card>

      <Card theme={theme}>
        <Row gap={8}>
          <Text style={textStyle(theme, 12, true)}>快速指派</Text>
          <Text style={textStyle(theme, 12, true)}>
            当前：{asString(data.assigneeLabel) || asString(data.assigneeDisplayName) || "未指派"}
          </Text>
        </Row>
        <Row gap={7}>
          <Button
            label="选择数字员工"
            theme={theme}
            compact
            icon="Users"
            disabled={busy !== null}
            onPress={() => setAssignOpen(true)}
          />
          <Button
            label="指定真人 ID"
            theme={theme}
            compact
            icon="User"
            disabled={busy !== null}
            onPress={() => setAssignOpen(true)}
          />
        </Row>
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
          value={comment}
          onChangeText={setComment}
          multiline
          placeholder="输入 Markdown 评论…"
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
        {comments.map((entry) => {
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
                paddingTop: 10,
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
                <MarkdownBlock
                  text={asString(entry.contentMd) || "—"}
                  theme={theme}
                  maxHeight={compact ? 180 : 260}
                />
              </View>
            </View>
          );
        })}
      </Card>

      {assignOpen ? (
        <Modal
          title="指派工单"
          open
          onOpenChange={(next) => {
            if (!next) setAssignOpen(false);
          }}
        >
          <Modal.Content>
        <Card theme={theme}>
          <Text style={textStyle(theme, 12, true)}>指派对象</Text>
          <Text style={textStyle(theme, 12, true)}>数字员工</Text>
          <Text style={textStyle(theme, 11, true)}>
            只会列出当前工作区可访问的数字员工；选择后立即指派并触发派发。
          </Text>
          {agentsQuery.isLoading ? <Loading theme={theme} /> : null}
          {agentsQuery.error ? (
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {errorMessage(agentsQuery.error)}
            </Text>
          ) : null}
          <View style={{ gap: 7 }}>
            {agents.map((agent) => {
              const id = asNumber(agent.id);
              if (id === undefined) return null;
              const name = asString(agent.name) || "数字员工";
              const label = `${name} #${id}`;
              return (
                <Pressable
                  key={id}
                  onPress={() => void assignToAgent(id, label)}
                  disabled={busy !== null}
                  style={{
                    padding: 11,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    opacity: busy !== null ? 0.6 : 1,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{label}</Text>
                    <Text style={textStyle(theme, 11, true)}>
                      {asString(agent.roleName)} · {asString(agent.status)}
                    </Text>
                  </View>
                  <Badge label={asString(agent.status) || "—"} theme={theme} />
                </Pressable>
              );
            })}
          </View>

          <Divider theme={theme} />

          <LabeledField
            label="真人用户 ID"
            hint="已知用户 ID 时可直接指派给真人。"
            theme={theme}
          >
            <Row gap={8}>
              <View style={{ flex: 1 }}>
                <Input
                  value={humanId}
                  onChangeText={setHumanId}
                  placeholder="例如 10006"
                  theme={theme}
                />
              </View>
              <Button
                label={busy === "assign-human" ? "指派中…" : "指派"}
                theme={theme}
                compact
                disabled={busy !== null || humanId.trim() === ""}
                onPress={() => void assignToHuman()}
              />
            </Row>
          </LabeledField>

          <Button label="关闭指派" theme={theme} onPress={() => setAssignOpen(false)} />
        </Card>
          </Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}
