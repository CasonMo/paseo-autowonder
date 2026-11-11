import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type { DetailExtraProps } from "./ResourceSection";
import {
  Badge,
  Button,
  Card,
  Divider,
  JsonBlock,
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

function parsedJson(value: unknown): unknown {
  const text = asString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function AgentDetailExtra({
  data,
  workspaceId,
  theme,
  compact,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const [selectedVersionNo, setSelectedVersionNo] = useState<number | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);

  const agentId = asNumber(data.id);
  useEffect(() => {
    setSelectedVersionNo(null);
    setShowSecrets(false);
    setShowIdentity(false);
  }, [agentId]);
  const versionsQuery = useQuery({
    queryKey: ["aw", workspaceId, "agent-versions", agentId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_agent_version_status",
        arguments: { workspaceId, id: agentId },
      });
      if (response.isError) throw new Error(response.contentText ?? "版本加载失败");
      return response.data;
    },
    enabled: agentId !== undefined,
    retry: 1,
  });
  const reposQuery = useQuery({
    queryKey: ["aw", workspaceId, "agent-version-repos"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_repos",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "仓库加载失败");
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const versions = useMemo(
    () =>
      asArray(asRecord(versionsQuery.data).versions)
        .map(asRecord)
        .sort((a, b) => (asNumber(b.versionNo) ?? 0) - (asNumber(a.versionNo) ?? 0)),
    [versionsQuery.data],
  );
  const repoNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const repo of listItems(reposQuery.data)) {
      const id = asNumber(repo.id);
      if (id !== undefined) map.set(id, asString(repo.name));
    }
    return map;
  }, [reposQuery.data]);

  useEffect(() => {
    if (versions.length === 0 || selectedVersionNo !== null) return;
    const online = versions.find((version) => asString(version.status) === "ONLINE");
    setSelectedVersionNo(asNumber((online ?? versions[0]).versionNo) ?? null);
  }, [versions, selectedVersionNo]);

  const versionQuery = useQuery({
    queryKey: ["aw", workspaceId, "agent-version", agentId, selectedVersionNo],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_agent_version",
        arguments: { workspaceId, agentId, versionNo: selectedVersionNo },
      });
      if (response.isError) throw new Error(response.contentText ?? "版本详情加载失败");
      return response.data;
    },
    enabled: agentId !== undefined && selectedVersionNo !== null,
    retry: 1,
  });

  const version = asRecord(versionQuery.data);
  const environmentVariables = asArray(version.environmentVariables)
    .map(asRecord)
    .filter((item) => asString(item.name));
  const identity = parsedJson(version.identityJson);
  const responsibilities = asString(version.responsibilities);
  const reviewComment = asString(version.reviewComment);

  return (
    <View style={{ gap: 10 }}>
      <Card theme={theme}>
        <Row gap={6} wrap>
          <Text style={textStyle(theme, 12, true)}>{t("当前版本状态")}</Text>
          <Badge
            label={`${t("在线")} #${asString(data.onlineVersionId) || "—"}`}
            theme={theme}
            tone="success"
          />
          <Badge
            label={`${t("编辑中")} #${asString(data.editingVersionId) || "—"}`}
            theme={theme}
            tone="accent"
          />
          {data.hasDraft === true ? (
            <Badge
              label={`${t("草稿")} v${asString(data.draftVersionNo) || "?"}`}
              theme={theme}
              tone="warning"
            />
          ) : null}
        </Row>
        <KeyValueRows
          columns={compact ? 1 : 2}
          theme={theme}
          entries={[
            { label: "角色", value: asString(data.roleName) || asString(data.roleCode) },
            { label: "进化模式", value: displayStatus(asString(data.evolutionMode)) },
            { label: "最新版本", value: asString(data.latestVersionNo) },
            { label: "版本", value: asString(data.version) },
          ]}
        />
        {asString(data.responsibilities) ? (
          <View style={{ gap: 4 }}>
            <Text style={textStyle(theme, 11, true)}>{t("职责说明")}</Text>
            <MarkdownBlock
              text={asString(data.responsibilities)}
              theme={theme}
              maxHeight={compact ? 160 : 220}
            />
          </View>
        ) : null}
      </Card>

      <Card theme={theme}>
        <Row gap={6}>
          <Text style={textStyle(theme, 12, true)}>{t("版本历史")}</Text>
          <Badge label={String(versions.length)} theme={theme} tone="accent" />
        </Row>
        {versionsQuery.isLoading ? <Loading theme={theme} /> : null}
        {versionsQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(versionsQuery.error)}
          </Text>
        ) : null}
        {versions.map((item) => {
          const versionNo = asNumber(item.versionNo);
          if (versionNo === undefined) return null;
          const selected = versionNo === selectedVersionNo;
          const status = asString(item.status);
          return (
            <Pressable
              key={versionNo}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedVersionNo(versionNo)}
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
                v{versionNo}
              </Text>
              <Badge label={displayStatus(status) || "—"} theme={theme} />
              <Text
                numberOfLines={1}
                style={{ ...textStyle(theme, 11, true), flex: 1 }}
              >
                {asString(item.roleName) || asString(item.roleCode)}
              </Text>
              <Text style={textStyle(theme, 10, true)}>
                {formatDateTime(item.gmtCreate)}
              </Text>
            </Pressable>
          );
        })}
      </Card>

      <Card theme={theme}>
        <Row gap={6} wrap>
          <Text style={textStyle(theme, 12, true)}>
            {t("版本详情")}
            {selectedVersionNo !== null ? ` · v${selectedVersionNo}` : ""}
          </Text>
          {selectedVersionNo !== null ? (
            <Badge label={displayStatus(asString(version.status)) || "—"} theme={theme} />
          ) : null}
          {environmentVariables.length > 0 ? (
            <Button
              label={showSecrets ? "隐藏环境变量值" : "显示环境变量值"}
              theme={theme}
              compact
              icon={showSecrets ? "EyeOff" : "Eye"}
              onPress={() => setShowSecrets((value) => !value)}
            />
          ) : null}
        </Row>
        {versionQuery.isLoading ? <Loading theme={theme} label="读取版本详情…" /> : null}
        {versionQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(versionQuery.error)}
          </Text>
        ) : null}
        {selectedVersionNo !== null && !versionQuery.isLoading && !versionQuery.error ? (
          <>
            <KeyValueRows
              columns={compact ? 1 : 2}
              theme={theme}
              entries={[
                { label: "状态", value: displayStatus(asString(version.status)) },
                { label: "角色", value: asString(version.roleName) || asString(version.roleCode) },
                { label: "进化模式", value: displayStatus(asString(version.evolutionMode)) },
                { label: "创建时间", value: formatDateTime(version.gmtCreate) },
                { label: "审核人", value: asString(version.reviewerId) },
                { label: "审核时间", value: formatDateTime(version.reviewedAt) },
              ]}
            />
            {reviewComment ? (
              <View style={{ gap: 4 }}>
                <Text style={textStyle(theme, 11, true)}>{t("审核意见")}</Text>
                <MarkdownBlock text={reviewComment} theme={theme} maxHeight={180} />
              </View>
            ) : null}
            {responsibilities ? (
              <View style={{ gap: 4 }}>
                <Text style={textStyle(theme, 11, true)}>{t("职责说明")}</Text>
                <MarkdownBlock text={responsibilities} theme={theme} maxHeight={220} />
              </View>
            ) : null}

            <Divider theme={theme} />
            <Text style={textStyle(theme, 11, true)}>{t("仓库权限")}</Text>
            {asArray(version.repoPerms).length === 0 ? (
              <Text style={textStyle(theme, 11, true)}>{t("暂无仓库权限")}</Text>
            ) : (
              asArray(version.repoPerms).map(asRecord).map((perm) => {
                const repoId = asNumber(perm.repoId);
                const patterns = asArray(perm.allowedBranchPatterns)
                  .map(asString)
                  .filter(Boolean);
                return (
                  <Row key={String(repoId)} gap={6} wrap>
                    <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                      {repoNames.get(repoId ?? -1) || `#${repoId ?? "?"}`}
                    </Text>
                    <Badge
                      label={displayStatus(asString(perm.permLevel)) || "—"}
                      theme={theme}
                      tone="accent"
                    />
                    {patterns.length > 0 ? (
                      <Text style={textStyle(theme, 10, true)}>
                        {patterns.join(", ")}
                      </Text>
                    ) : null}
                  </Row>
                );
              })
            )}

            <Text style={textStyle(theme, 11, true)}>{t("能力绑定")}</Text>
            {asArray(version.skills).length === 0 ? (
              <Text style={textStyle(theme, 11, true)}>{t("暂无能力绑定")}</Text>
            ) : (
              asArray(version.skills).map(asRecord).map((skill) => (
                <Text key={String(skill.skillId)} style={textStyle(theme, 11)}>
                  {asString(skill.skillName) || t("能力")} #{asString(skill.skillId)}
                </Text>
              ))
            )}

            <Text style={textStyle(theme, 11, true)}>{t("记忆绑定")}</Text>
            {asArray(version.memoryRefs).length === 0 ? (
              <Text style={textStyle(theme, 11, true)}>{t("暂无记忆绑定")}</Text>
            ) : (
              asArray(version.memoryRefs).map(asRecord).map((memory) => (
                <Text key={String(memory.memoryId)} style={textStyle(theme, 11)}>
                  #{asString(memory.memoryId)} · {asString(memory.source)}
                </Text>
              ))
            )}

            {environmentVariables.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={textStyle(theme, 11, true)}>
                  {t("环境变量（敏感，默认打码）")}
                </Text>
                {environmentVariables.map((item) => (
                  <View key={asString(item.id) || asString(item.name)} style={{ gap: 1 }}>
                    <Text style={{ color: theme.colors.foreground, fontSize: 11 }}>
                      {asString(item.name)}
                    </Text>
                    {asString(item.description) ? (
                      <Text style={textStyle(theme, 10, true)}>
                        {asString(item.description)}
                      </Text>
                    ) : null}
                    <Text style={textStyle(theme, 11, true)}>
                      {showSecrets ? asString(item.value) : "••••••••"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {identity !== null ? (
              <View style={{ gap: 4 }}>
                <Button
                  label={showIdentity ? "收起身份扩展 JSON" : "查看身份扩展 JSON"}
                  theme={theme}
                  compact
                  icon={showIdentity ? "ChevronUp" : "Code"}
                  onPress={() => setShowIdentity((value) => !value)}
                />
                {showIdentity ? (
                  <JsonBlock value={identity} theme={theme} maxHeight={220} />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </Card>
    </View>
  );
}
