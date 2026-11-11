import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { DetailExtraProps } from "./ResourceSection";
import {
  Badge,
  Button,
  Card,
  JsonBlock,
  KeyValueRows,
  Loading,
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

function parsedJson(value: unknown): unknown {
  const text = asString(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function SkillDetailExtra({
  data,
  workspaceId,
  theme,
  compact,
  onChanged,
}: DetailExtraProps) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const toast = useToast();
  const [showInstallSpec, setShowInstallSpec] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setShowInstallSpec(false);
  }, [data.id]);
  const platformQuery = useQuery({
    queryKey: ["aw", "platform-skills"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_platform_skills",
        arguments: {},
      });
      if (response.isError) throw new Error(response.contentText ?? "平台技能加载失败");
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const platformSkills = listItems(platformQuery.data);
  const installSpec = parsedJson(data.installSpec);

  async function install(skillId: string) {
    setBusy(skillId);
    try {
      const response = await call({
        name: "autowonder.install_platform_skill",
        arguments: { workspaceId, skillId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? t("安装失败"));
        return;
      }
      toast.show(t("已安装"), { variant: "success" });
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
          <Text style={textStyle(theme, 12, true)}>{t("能力信息")}</Text>
          <Badge label={displayStatus(asString(data.type)) || "—"} theme={theme} />
          {asString(data.sourceType) ? (
            <Badge label={asString(data.sourceType)} theme={theme} tone="muted" />
          ) : null}
        </Row>
        <KeyValueRows
          columns={compact ? 1 : 2}
          theme={theme}
          entries={[
            { label: "分类", value: asString(data.categoryPath) || undefined },
            { label: "修改人", value: asString(data.modifierName) || undefined },
            { label: "包文件", value: asString(data.packageFileName) || undefined },
            {
              label: "包大小",
              value: asNumber(data.packageSize) !== undefined ? formatSize(data.packageSize) : undefined,
            },
            { label: "包 MD5", value: asString(data.packageMd5) || undefined },
            { label: "版本", value: asString(data.version) },
            { label: "创建时间", value: formatDateTime(data.gmtCreate) },
            { label: "更新时间", value: formatDateTime(data.gmtModified) },
          ]}
        />
        {installSpec !== null ? (
          <View style={{ gap: 4 }}>
            <Button
              label={showInstallSpec ? "收起 installSpec" : "查看 installSpec"}
              theme={theme}
              compact
              icon={showInstallSpec ? "ChevronUp" : "Code"}
              onPress={() => setShowInstallSpec((value) => !value)}
            />
            {showInstallSpec ? (
              <JsonBlock value={installSpec} theme={theme} maxHeight={260} />
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card theme={theme}>
        <Row gap={6}>
          <Text style={textStyle(theme, 12, true)}>{t("平台技能")}</Text>
          <Badge label={String(platformSkills.length)} theme={theme} tone="accent" />
        </Row>
        {platformQuery.isLoading ? <Loading theme={theme} /> : null}
        {platformQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(platformQuery.error)}
          </Text>
        ) : null}
        {platformSkills.length === 0 && !platformQuery.isLoading ? (
          <Text style={textStyle(theme, 11, true)}>{t("暂无平台技能")}</Text>
        ) : (
          platformSkills.map((skill) => {
            const skillId = asString(skill.id);
            const description = asString(skill.description);
            return (
              <View
                key={skillId}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 7,
                  backgroundColor: theme.colors.surface0,
                  padding: 8,
                  gap: 4,
                }}
              >
                <Row gap={6} wrap>
                  <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>
                    {asString(skill.name) || skillId}
                  </Text>
                  {asString(skill.type) ? (
                    <Badge label={displayStatus(asString(skill.type))} theme={theme} />
                  ) : null}
                  <Button
                    label={busy === skillId ? "安装中…" : "安装"}
                    theme={theme}
                    compact
                    tone="primary"
                    icon="Download"
                    disabled={busy !== null}
                    onPress={() => void install(skillId)}
                  />
                </Row>
                {description ? (
                  <Text style={textStyle(theme, 10, true)}>{description}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}
