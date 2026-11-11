import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { DetailExtraProps } from "./ResourceSection";
import {
  Badge,
  Button,
  Card,
  Row,
  SelectField,
  textStyle,
  type FieldOption,
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

export function SquadDetailExtra({
  data,
  workspaceId,
  theme,
  compact,
  onChanged,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const [selectedAgent, setSelectedAgent] = useState("");
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const squadId = asNumber(data.id);
  useEffect(() => {
    setSelectedAgent("");
    setRemoveTarget(null);
  }, [squadId]);
  const memberIds = useMemo(
    () =>
      asArray(data.memberAgentIds)
        .map((value) => asNumber(value))
        .filter((value): value is number => value !== undefined),
    [data.memberAgentIds],
  );
  const agentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "squad-agents"],
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
  const agents = listItems(agentsQuery.data);
  const agentMap = useMemo(() => {
    const map = new Map<number, Record<string, unknown>>();
    for (const agent of agents) {
      const id = asNumber(agent.id);
      if (id !== undefined) map.set(id, agent);
    }
    return map;
  }, [agents]);
  const availableOptions: FieldOption[] = useMemo(
    () =>
      agents.flatMap((agent) => {
        const id = asNumber(agent.id);
        if (id === undefined || memberIds.includes(id)) return [];
        const name = asString(agent.name) || t("数字员工");
        return [{ value: String(id), label: `${name} #${id}` }];
      }),
    [agents, memberIds, t],
  );
  const sdlcs = asArray(data.sdlcs).map(asRecord);
  const executors = asArray(data.executors).map(asRecord);

  async function addMember() {
    const agentId = Number(selectedAgent);
    if (!Number.isFinite(agentId) || squadId === undefined) return;
    setBusy("add");
    try {
      const response = await call({
        name: "autowonder.add_agent_to_squad",
        arguments: { workspaceId, squadId, agentId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("添加成员失败"));
        return;
      }
      toast.show(t("成员已添加"), { variant: "success" });
      setSelectedAgent("");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(agentId: number) {
    if (squadId === undefined) return;
    if (removeTarget !== agentId) {
      setRemoveTarget(agentId);
      toast.show(t("再点一次移除"), { variant: "warning" });
      return;
    }
    setBusy(`remove-${agentId}`);
    try {
      const response = await call({
        name: "autowonder.remove_agent_from_squad",
        arguments: { workspaceId, squadId, agentId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("移除成员失败"));
        return;
      }
      toast.show(t("成员已移除"), { variant: "success" });
      setRemoveTarget(null);
      onChanged();
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
          <Text style={textStyle(theme, 12, true)}>{t("成员数字员工")}</Text>
          <Badge label={String(memberIds.length)} theme={theme} tone="accent" />
          {data.debugLogEnabled === true ? (
            <Badge label={t("调试日志")} theme={theme} tone="warning" />
          ) : null}
        </Row>
        {memberIds.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无成员")}</Text>
        ) : (
          memberIds.map((agentId) => {
            const agent = agentMap.get(agentId);
            const name = asString(agent?.name) || t("数字员工");
            return (
              <Row key={agentId} gap={6} wrap>
                <Text style={{ color: theme.colors.foreground, fontSize: 12, flexShrink: 1 }}>
                  {name} #{agentId}
                </Text>
                {asString(agent?.roleName) ? (
                  <Text style={textStyle(theme, 10, true)}>{asString(agent?.roleName)}</Text>
                ) : null}
                {asString(agent?.status) ? (
                  <Badge label={displayStatus(asString(agent?.status))} theme={theme} />
                ) : null}
                <Button
                  label={removeTarget === agentId ? "再点确认" : "移除"}
                  theme={theme}
                  compact
                  tone="danger"
                  disabled={busy !== null}
                  onPress={() => void removeMember(agentId)}
                />
              </Row>
            );
          })
        )}
        <Row gap={8} wrap>
          <View style={{ minWidth: compact ? "100%" : 220, flexGrow: 1 }}>
            <SelectField
              value={selectedAgent}
              options={availableOptions}
              onChange={setSelectedAgent}
              theme={theme}
            />
          </View>
          <Button
            label={busy === "add" ? "添加中…" : "添加成员"}
            theme={theme}
            compact
            icon="Plus"
            disabled={busy !== null || selectedAgent === ""}
            onPress={() => void addMember()}
          />
        </Row>
        {availableOptions.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无可添加成员")}</Text>
        ) : null}
      </Card>

      <Card theme={theme}>
        <Row gap={6}>
          <Text style={textStyle(theme, 12, true)}>{t("关联 SDLC")}</Text>
          <Badge label={String(sdlcs.length)} theme={theme} tone="accent" />
        </Row>
        {sdlcs.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无关联 SDLC")}</Text>
        ) : (
          sdlcs.map((sdlc) => (
            <Row key={asString(sdlc.id)} gap={6} wrap>
              <Text style={{ color: theme.colors.foreground, fontSize: 12, flexShrink: 1 }}>
                {asString(sdlc.name) || `#${asString(sdlc.id)}`}
              </Text>
              {asString(sdlc.workType) ? (
                <Badge label={displayStatus(asString(sdlc.workType))} theme={theme} />
              ) : null}
              {asString(sdlc.status) ? (
                <Badge label={displayStatus(asString(sdlc.status))} theme={theme} />
              ) : null}
            </Row>
          ))
        )}
      </Card>

      <Card theme={theme}>
        <Row gap={6}>
          <Text style={textStyle(theme, 12, true)}>{t("执行器")}</Text>
          <Badge label={String(executors.length)} theme={theme} tone="accent" />
        </Row>
        {executors.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无执行器")}</Text>
        ) : (
          executors.map((executor) => (
            <Row key={asString(executor.id)} gap={6} wrap>
              <Text style={{ color: theme.colors.foreground, fontSize: 12, flexShrink: 1 }}>
                {asString(executor.name) || `#${asString(executor.id)}`}
              </Text>
              {asString(executor.agentName) ? (
                <Text style={textStyle(theme, 10, true)}>{asString(executor.agentName)}</Text>
              ) : null}
              {asString(executor.status) ? (
                <Badge label={displayStatus(asString(executor.status))} theme={theme} />
              ) : null}
              {asString(executor.clientKind) ? (
                <Text style={textStyle(theme, 10, true)}>{asString(executor.clientKind)}</Text>
              ) : null}
              {asString(executor.lastHeartbeat) ? (
                <Text style={textStyle(theme, 10, true)}>
                  {formatDateTime(executor.lastHeartbeat)}
                </Text>
              ) : null}
            </Row>
          ))
        )}
      </Card>
    </View>
  );
}
