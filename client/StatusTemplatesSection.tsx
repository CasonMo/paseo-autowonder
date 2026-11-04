import { useRpc } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import { callToolRpc } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  JsonBlock,
  Loading,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  formatDateTime,
  listItems,
  workTypeLabel,
} from "./lib";

const WORK_TYPES = [
  { value: "REQ", label: "需求 REQ" },
  { value: "TASK", label: "任务 TASK" },
  { value: "BUG", label: "缺陷 BUG" },
] as const;

function nodeCategoryTone(category: string): "success" | "warning" | "danger" | "accent" | "muted" {
  if (category === "DONE") return "success";
  if (category === "CANCELED") return "danger";
  if (category === "IN_PROGRESS") return "accent";
  return "muted";
}

export function StatusTemplatesSection({
  workspaceId,
  theme,
  compact,
}: {
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const [workType, setWorkType] = useState<(typeof WORK_TYPES)[number]["value"]>("REQ");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const query = useQuery({
    queryKey: ["aw", workspaceId, "status-templates", workType],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_status_templates",
        arguments: { workspaceId, workType },
      });
      if (response.isError) throw new Error(response.contentText ?? "状态模版加载失败");
      return response.data;
    },
    retry: 1,
  });
  const items = listItems(query.data);

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="状态模版"
        subtitle="查看工单状态节点与推荐流转。当前 MCP 只提供只读查询，编辑请到 AutoWonder 页面。"
        theme={theme}
        trailing={
          <Button label="刷新" theme={theme} compact onPress={() => void query.refetch()} />
        }
      />
      <Row gap={6}>
        {WORK_TYPES.map((type) => (
          <Chip
            key={type.value}
            label={type.label}
            active={workType === type.value}
            theme={theme}
            onPress={() => setWorkType(type.value)}
          />
        ))}
      </Row>

      {query.isLoading ? <Loading theme={theme} /> : null}
      {query.error ? (
        <ErrorBox error={query.error} theme={theme} onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.error && items.length === 0 ? (
        <Empty title="暂无状态模版" theme={theme} />
      ) : null}

      <View style={{ gap: 8 }}>
        {items.map((item) => (
          <Pressable
            key={String(item.id)}
            accessibilityRole="button"
            onPress={() => setSelected(item)}
            style={({ pressed }) => ({
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 9,
              padding: 12,
              gap: 6,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Row gap={7}>
              <Text
                translate={false}
                style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "500", flex: 1 }}
              >
                {asString(item.name)}
              </Text>
              {item.isDefault === true ? <Badge label="默认" theme={theme} tone="accent" /> : null}
            </Row>
            <Text translate={false} style={textStyle(theme, 11, true)}>
              {t("{{id}} · {{type}} · 更新于 {{time}}", {
                id: `#${String(item.id ?? "")}`,
                type: t(workTypeLabel(asString(item.workType))),
                time: formatDateTime(item.gmtModified),
              })}
            </Text>
          </Pressable>
        ))}
      </View>

      <StatusTemplateDetail
        open={selected !== null}
        item={selected}
        workspaceId={workspaceId}
        theme={theme}
        compact={compact}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

function StatusTemplateDetail({
  open,
  item,
  workspaceId,
  theme,
  compact,
  onClose,
}: {
  open: boolean;
  item: Record<string, unknown> | null;
  workspaceId: number;
  theme: PluginTheme;
  compact: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const query = useQuery({
    queryKey: ["aw", workspaceId, "status-template-detail", item?.id],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.get_status_template",
        arguments: { workspaceId, id: item?.id },
      });
      if (response.isError) throw new Error(response.contentText ?? "状态模版详情加载失败");
      return response.data;
    },
    enabled: open && item !== null,
    retry: 1,
  });
  const data = asRecord(query.data ?? item);
  const nodes = asArray(data.nodes).map(asRecord);
  const transitions = asArray(data.transitions).map(asRecord);
  const nodeName = (id: unknown) => {
    const found = nodes.find((node) => asNumber(node.id) === asNumber(id));
    return asString(found?.name) || `#${asString(id)}`;
  };

  return (
    <Modal
      title={asString(data.name) || t("状态模版")}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content>
        <View style={{ gap: 14 }}>
          {query.isLoading ? <Loading theme={theme} /> : null}
          {query.error ? <ErrorBox error={query.error} theme={theme} /> : null}
          <Row gap={7}>
            <Badge label={asString(data.workType) || "—"} theme={theme} />
            {data.isDefault === true ? <Badge label="默认模版" theme={theme} tone="accent" /> : null}
          </Row>

          <View style={{ gap: 7 }}>
            <Text style={textStyle(theme, 12, true)}>
              {t("状态节点（{{count}}）", { count: nodes.length })}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {nodes.map((node) => (
                <Card key={String(node.id)} theme={theme} style={{ width: compact ? "100%" : "48%" }}>
                  <Row gap={7}>
                    <Text
                      translate={false}
                      style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500", flex: 1 }}
                    >
                      {asString(node.name)}
                    </Text>
                    <Badge
                      label={asString(node.category)}
                      theme={theme}
                      tone={nodeCategoryTone(asString(node.category))}
                    />
                  </Row>
                  <Text translate={false} style={textStyle(theme, 11, true)}>
                    {asString(node.code)} · #{String(node.id ?? "")}
                  </Text>
                </Card>
              ))}
            </View>
          </View>

          <View style={{ gap: 7 }}>
            <Text style={textStyle(theme, 12, true)}>
              {t("推荐流转（{{count}}）", { count: transitions.length })}
            </Text>
            {transitions.length === 0 ? (
              <Text style={textStyle(theme, 11, true)}>暂无推荐流转。</Text>
            ) : (
              transitions.map((transition) => (
                <Text
                  key={String(transition.id)}
                  translate={false}
                  style={textStyle(theme, 12)}
                >
                  {nodeName(transition.fromNodeId)} → {nodeName(transition.toNodeId)} ·{" "}
                  {asString(transition.name)}
                </Text>
              ))
            )}
          </View>

          <JsonBlock value={data} theme={theme} maxHeight={320} title="原始 JSON" />
          <Button label="关闭" theme={theme} onPress={onClose} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
