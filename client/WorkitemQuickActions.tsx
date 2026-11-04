import { openExternalUrl, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { autowonderSettings, callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Divider,
  Input,
  LabeledField,
  Loading,
  Row,
  textStyle,
} from "./components";
import type { DetailExtraProps } from "./ResourceSection";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  displayStatus,
  errorMessage,
  listItems,
  workitemWebUrl,
} from "./lib";

export function WorkitemQuickActions({
  data,
  workspaceId,
  theme,
  onChanged,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const settings = useSettings(autowonderSettings);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [humanId, setHumanId] = useState("");
  const [confirmNodeId, setConfirmNodeId] = useState<number | null>(null);

  const workitemId = asNumber(data.id);
  const templateId = asNumber(data.templateId);
  const currentStatusNodeId = asNumber(data.statusNodeId);
  const webUrl =
    workitemId !== undefined && settings.status === "ready"
      ? workitemWebUrl(
          settings.values.mcpUrl,
          workitemId,
          settings.values.webBaseUrl,
        )
      : null;

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
        name: nodeName.get(targetId) ?? t("节点 #{{id}}", { id: targetId }),
        category: asString(asRecord(nodes.find((node) => asNumber(node.id) === targetId)).category),
        transitionName: asString(transition.name),
      });
    }
    return result;
  }, [template.transitions, currentStatusNodeId, nodeName, nodes, t]);

  const agents = listItems(agentsQuery.data, "items");
  const assignee =
    asString(data.assigneeLabel) || asString(data.assigneeDisplayName) || "未指派";
  const currentStatusName = asString(data.statusName) || "—";

  async function transition(toNodeId: number, label: string) {
    if (workitemId === undefined) return;
    setBusy(`transition-${toNodeId}`);
    try {
      const response = await call({
        name: "autowonder.transition_workitem",
        arguments: { workspaceId, id: workitemId, toNodeId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("流转失败"));
        return;
      }
      toast.show(t("已流转到「{{name}}」", { name: label }), { variant: "success" });
      setTransitionOpen(false);
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
        toast.error(response.contentText ?? t("指派失败"));
        return;
      }
      toast.show(t("已指派给 {{name}}", { name: agentName }), { variant: "success" });
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
        toast.error(response.contentText ?? t("指派失败"));
        return;
      }
      toast.show(
        t("已指派给 {{name}}", {
          name: label ?? t("真人 #{{id}}", { id }),
        }),
        { variant: "success" },
      );
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
      toast.error(t("请填写有效的用户 ID"));
      return;
    }
    await assignToHumanId(Math.trunc(id));
  }

  if (workitemId === undefined) return null;

  return (
    <>
      <Button
        label="流转"
        theme={theme}
        compact
        icon="ArrowRightLeft"
        disabled={busy !== null}
        onPress={() => {
          setConfirmNodeId(null);
          setTransitionOpen(true);
        }}
      />
      <Button
        label="指派"
        theme={theme}
        compact
        icon="User"
        disabled={busy !== null}
        onPress={() => setAssignOpen(true)}
      />
      {webUrl ? (
        <Button
          label={t("在 AutoWonder 打开")}
          theme={theme}
          compact
          icon="ExternalLink"
          onPress={() => {
            void openExternalUrl(webUrl).catch(() => {
              toast.error(t("打开失败"));
            });
          }}
        />
      ) : null}

      {transitionOpen ? (
        <Modal
          title={t("状态流转")}
          open
          onOpenChange={(next) => {
            if (!next) {
              setTransitionOpen(false);
              setConfirmNodeId(null);
            }
          }}
        >
          <Modal.Content>
            <Card theme={theme}>
              <Text style={textStyle(theme, 12, true)}>
                {t("当前状态：")}{currentStatusName}
              </Text>
              {templateQuery.isLoading ? (
                <Loading theme={theme} label="读取状态模板…" />
              ) : null}
              {templateQuery.error ? (
                <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                  {errorMessage(templateQuery.error)}
                </Text>
              ) : null}
              {!templateQuery.isLoading &&
              !templateQuery.error &&
              nextNodes.length === 0 ? (
                <Text style={textStyle(theme, 11, true)}>
                  当前状态没有可用的流转目标。
                </Text>
              ) : null}
              <View style={{ gap: 7 }}>
                {nextNodes.map((node) => {
                  const id = asNumber(node.id) ?? 0;
                  const name = asString(node.name);
                  const transitionName = asString(node.transitionName);
                  const danger = asString(node.category) === "CANCELED";
                  const pending = confirmNodeId === id;
                  return (
                    <Pressable
                      key={id}
                      disabled={busy !== null}
                      onPress={() => {
                        if (danger && !pending) {
                          setConfirmNodeId(id);
                          return;
                        }
                        void transition(id, name);
                      }}
                      style={{
                        padding: 11,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: pending
                          ? theme.colors.statusWarning
                          : theme.colors.border,
                        backgroundColor: theme.colors.surface0,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        opacity: busy !== null ? 0.6 : 1,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
                          {busy === `transition-${id}`
                            ? "处理中…"
                            : pending
                              ? t("确认{{name}}", { name })
                              : name}
                        </Text>
                        {transitionName ? (
                          <Text style={textStyle(theme, 11, true)}>{transitionName}</Text>
                        ) : null}
                      </View>
                      {danger ? (
                        <Badge
                          label={pending ? "再点确认" : "取消类"}
                          theme={theme}
                          tone="danger"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {nextNodes.some((node) => asString(node.category) === "CANCELED") &&
              confirmNodeId !== null ? (
                <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
                  取消类流转不可逆，再点一次确认执行。
                </Text>
              ) : null}
              <Button
                label="关闭"
                theme={theme}
                onPress={() => {
                  setTransitionOpen(false);
                  setConfirmNodeId(null);
                }}
              />
            </Card>
          </Modal.Content>
        </Modal>
      ) : null}

      {assignOpen ? (
        <Modal
          title={t("指派工单")}
          open
          onOpenChange={(next) => {
            if (!next) setAssignOpen(false);
          }}
        >
          <Modal.Content>
            <Card theme={theme}>
              <Text style={textStyle(theme, 12, true)}>指派对象</Text>
              <Text style={textStyle(theme, 11, true)}>{t("当前：")}{assignee}</Text>
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
                  const name = asString(agent.name) || t("数字员工");
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
                        <Text
                          translate={false}
                          style={{ color: theme.colors.foreground, fontSize: 13 }}
                        >
                          {label}
                        </Text>
                        <Text translate={false} style={textStyle(theme, 11, true)}>
                          {asString(agent.roleName)} ·{" "}
                          {t(displayStatus(asString(agent.status)))}
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
    </>
  );
}
