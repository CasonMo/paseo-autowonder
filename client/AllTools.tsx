import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import type { ToolDescriptor } from "../shared/contracts";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Input,
  Row,
  SectionHeader,
  textStyle,
} from "./components";
import { ToolRunner } from "./ToolRunner";
import { truncate } from "./lib";
import { useI18n } from "./i18n";

interface ToolGroup {
  id: string;
  label: string;
  test: (name: string) => boolean;
}

const GROUPS: ToolGroup[] = [
  { id: "workitem", label: "工单", test: (name) => /workitem/.test(name) },
  { id: "agent", label: "数字员工", test: (name) => /agent/.test(name) },
  { id: "sdlc", label: "SDLC", test: (name) => /sdlc|status_template/.test(name) },
  { id: "squad", label: "小队", test: (name) => /squad/.test(name) },
  { id: "repo", label: "仓库", test: (name) => /repo/.test(name) },
  { id: "skill", label: "能力与分类", test: (name) => /skill|category/.test(name) },
  { id: "scheduled", label: "定时任务", test: (name) => /scheduled/.test(name) },
  { id: "executor", label: "执行器", test: (name) => /executor/.test(name) },
  { id: "delivery", label: "交付与运行", test: (name) => /delivery|dispatch/.test(name) },
  { id: "memory", label: "记忆", test: (name) => /memor/.test(name) },
  { id: "project", label: "工作区", test: (name) => /project/.test(name) },
];

function groupOf(name: string): ToolGroup {
  return GROUPS.find((group) => group.test(name)) ?? { id: "other", label: "其他", test: () => true };
}

function isDestructive(name: string): boolean {
  return (
    /(^|\.)(delete|remove|unbind|archive|cancel|close)_/.test(name) ||
    /control_delivery$/.test(name) ||
    /transition_scheduled_task$/.test(name)
  );
}

export function AllTools({
  workspaceId,
  tools,
  theme,
  compact,
}: {
  workspaceId: number;
  tools: ToolDescriptor[];
  theme: PluginTheme;
  compact: boolean;
}) {
  const { t } = useI18n();
  const [keyword, setKeyword] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<ToolDescriptor | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tool of tools) {
      const id = groupOf(tool.name).id;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [tools]);

  const visible = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return tools.filter((tool) => {
      if (group !== "all" && groupOf(tool.name).id !== group) return false;
      if (!needle) return true;
      return (
        tool.name.toLowerCase().includes(needle) ||
        tool.description.toLowerCase().includes(needle)
      );
    });
  }, [tools, keyword, group]);
  const shown = useMemo(() => visible.slice(0, limit), [visible, limit]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolDescriptor[]>();
    const totals = new Map<string, number>();
    for (const tool of visible) {
      const id = groupOf(tool.name).id;
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    for (const tool of shown) {
      const id = groupOf(tool.name).id;
      const list = map.get(id) ?? [];
      list.push(tool);
      map.set(id, list);
    }
    const order = [...GROUPS.map((item) => item.id), "other"];
    return order
      .filter((id) => (map.get(id)?.length ?? 0) > 0)
      .map((id) => ({
        label: GROUPS.find((item) => item.id === id)?.label ?? "其他",
        tools: map.get(id) ?? [],
        total: totals.get(id) ?? 0,
      }));
  }, [shown, visible]);

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader
        title="全部工具"
        subtitle={t("MCP 动态发现 {{count}} 个工具，新增工具无需更新插件。", {
          count: tools.length,
        })}
        theme={theme}
      />
      <Card theme={theme}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>
          {t(
            "当前 MCP 未暴露回收站、平台集成、成员管理、项目配置备份、环境变量、数据洞察和审计日志等页面接口；这些操作仍需到 AutoWonder 网页完成。MCP 一旦新增工具，会自动出现在下方列表。",
          )}
        </Text>
      </Card>
      <Input
        value={keyword}
        onChangeText={(value) => {
          setKeyword(value);
          setLimit(40);
        }}
        placeholder="搜索工具名或说明…"
        theme={theme}
      />
      <Row gap={6}>
        <Chip
          label={t("全部 {{count}}", { count: tools.length })}
          active={group === "all"}
          theme={theme}
          onPress={() => {
            setGroup("all");
            setLimit(40);
          }}
        />
        {GROUPS.filter((item) => (counts.get(item.id) ?? 0) > 0).map((item) => (
          <Chip
            key={item.id}
            label={`${item.label} ${counts.get(item.id) ?? 0}`}
            active={group === item.id}
            theme={theme}
            onPress={() => {
              setGroup(item.id);
              setLimit(40);
            }}
          />
        ))}
      </Row>

      {visible.length === 0 ? (
        <Empty title="没有匹配的工具" hint="换个关键词试试。" theme={theme} />
      ) : null}

      {grouped.map((section) => (
        <View key={section.label} style={{ gap: 7 }}>
          <Text style={textStyle(theme, 12, true)}>
            {section.label} · {section.tools.length}
            {section.total > section.tools.length ? `/${section.total}` : ""}
          </Text>
          {section.tools.map((tool) => {
            const shortName = tool.name.replace(/^autowonder\./, "");
            const description = tool.description.split("\n")[0] ?? "";
            return (
              <Pressable
                key={tool.name}
                accessibilityRole="button"
                accessibilityLabel={tool.name}
                onPress={() => setSelected(tool)}
                style={({ pressed }) => ({
                  padding: 11,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: pressed ? theme.colors.accent : theme.colors.border,
                  backgroundColor: theme.colors.surface1,
                  gap: 4,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text
                    selectable
                    translate={false}
                    style={{
                      color: theme.colors.foreground,
                      fontSize: 13,
                      flex: 1,
                    }}
                  >
                    {shortName}
                  </Text>
                  {isDestructive(tool.name) ? (
                    <Badge label="删除/取消" theme={theme} tone="danger" />
                  ) : null}
                </View>
                <Text
                  numberOfLines={compact ? 2 : 1}
                  translate={false}
                  style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}
                >
                  {truncate(description, compact ? 120 : 220)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      {visible.length > limit ? (
        <Button
          label={t("显示更多（已显示 {{shown}}/{{visible}}）", {
            shown: shown.length,
            visible: visible.length,
          })}
          theme={theme}
          icon="ChevronDown"
          onPress={() => setLimit((value) => value + 40)}
        />
      ) : null}

      <ToolRunner
        open={selected !== null}
        tool={selected}
        preset={{ workspaceId }}
        theme={theme}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
