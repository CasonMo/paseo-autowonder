import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  autowonderSettings,
  pingRpc,
  type AutoWonderSettingsValues,
} from "../shared/contracts";
import {
  Button,
  Card,
  Divider,
  Input,
  LabeledField,
  Loading,
  SectionHeader,
  textStyle,
} from "./components";
import { errorMessage } from "./lib";

interface TestState {
  ok: boolean;
  message: string;
}

function describeTest(result: {
  ok: boolean;
  toolCount: number;
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  error?: string;
}): TestState {
  if (!result.ok) return { ok: false, message: result.error ?? "连接失败" };
  const name = result.serverName ?? "AutoWonder";
  const version = result.serverVersion ? ` ${result.serverVersion}` : "";
  return {
    ok: true,
    message: `连接成功：${name}${version}，共 ${result.toolCount} 个工具${
      result.protocolVersion ? `（MCP ${result.protocolVersion}）` : ""
    }`,
  };
}

export function SettingsPanel({
  theme,
  compact,
  onSaved,
  showHeader = true,
}: {
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  onSaved?: (values: AutoWonderSettingsValues) => void;
  showHeader?: boolean;
}) {
  const settings = useSettings(autowonderSettings);
  const ping = useRpc(pingRpc);
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [pollSeconds, setPollSeconds] = useState("60");
  const [riskRadarEnabled, setRiskRadarEnabled] = useState(true);
  const [documentCliConsent, setDocumentCliConsent] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [syncedRevision, setSyncedRevision] = useState<string | null>(null);

  const ready = settings.status === "ready" ? settings : null;

  useEffect(() => {
    if (!ready || ready.revision === syncedRevision) return;
    setUrl(ready.values.mcpUrl);
    setPollSeconds(String(ready.values.pollIntervalSeconds));
    setRiskRadarEnabled(ready.values.riskRadarEnabled);
    setDocumentCliConsent(ready.values.documentCliConsent);
    setPollError(null);
    setSyncedRevision(ready.revision);
  }, [ready, syncedRevision]);

  const resultStyle = useMemo(
    () => ({
      color: testState?.ok ? theme.colors.statusSuccess : theme.colors.statusDanger,
      fontSize: 12,
      lineHeight: 18,
    }),
    [theme, testState?.ok],
  );

  if (settings.status === "loading") {
    return <Loading theme={theme} label="读取插件配置…" />;
  }
  if (settings.status === "error") {
    return (
      <Card theme={theme}>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
          配置读取失败：{settings.error}
        </Text>
        <Button label="重新读取" onPress={() => void settings.reload()} theme={theme} />
      </Card>
    );
  }
  if (settings.status === "invalid") {
    return (
      <Card theme={theme}>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
          配置数据无效：{settings.error}
        </Text>
        <Button label="重置配置" onPress={() => void settings.reset()} theme={theme} />
      </Card>
    );
  }

  function validate(value: string): string | null {
    if (!value) return "请填写 MCP URL";
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return "MCP URL 仅支持 http 或 https";
      }
    } catch {
      return "MCP URL 格式不正确";
    }
    return null;
  }

  async function save() {
    if (!ready) return;
    const nextUrl = url.trim();
    const validation = validate(nextUrl);
    if (validation) {
      setLocalError(validation);
      return;
    }
    const interval = Number(pollSeconds.trim());
    if (
      !Number.isInteger(interval) ||
      interval < 0 ||
      interval > 3600 ||
      (interval > 0 && interval < 15)
    ) {
      setPollError("轮询间隔需为 0 或 15-3600 的整数（0 表示关闭）");
      return;
    }
    setPollError(null);
    setLocalError(null);
    setSaving(true);
    try {
      const ok = await settings.save(
        {
          mcpUrl: nextUrl,
          pollIntervalSeconds: interval,
          riskRadarEnabled,
          documentCliConsent,
        },
        ready.revision,
      );
      if (!ok) {
        toast.error(settings.saveError ?? "保存失败，请重试");
        return;
      }
      toast.show("AutoWonder 设置已保存", { variant: "success" });
      onSaved?.({
        mcpUrl: nextUrl,
        pollIntervalSeconds: interval,
        riskRadarEnabled,
        documentCliConsent,
      });
      const result = await ping({ url: nextUrl });
      setTestState(describeTest(result));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    const nextUrl = url.trim();
    const validation = validate(nextUrl);
    if (validation) {
      setLocalError(validation);
      return;
    }
    setLocalError(null);
    setTesting(true);
    setTestState(null);
    try {
      const result = await ping({ url: nextUrl });
      setTestState(describeTest(result));
    } catch (error) {
      setTestState({ ok: false, message: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {showHeader ? (
        <SectionHeader
          title="AutoWonder 连接"
          subtitle="只需配置一个 MCP URL，所有管理能力都通过它调用。"
          theme={theme}
        />
      ) : null}

      <Card theme={theme}>
        <LabeledField
          label="MCP URL"
          required
          error={localError}
          hint="从 AutoWonder 的 MCP 接入页复制完整地址。地址里通常包含个人访问 token，请勿分享给他人；它只保存在这台 daemon 的插件配置中。"
          theme={theme}
        >
          <View style={{ gap: 8 }}>
            <Input
              value={url}
              onChangeText={(value) => {
                setUrl(value);
                setLocalError(null);
                setTestState(null);
              }}
              placeholder="https://your-autowonder-host/api/mcp/.../"
              theme={theme}
              secureTextEntry={!reveal}
            />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                label={reveal ? "隐藏 URL" : "显示 URL"}
                theme={theme}
                compact
                icon={reveal ? "EyeOff" : "Eye"}
                onPress={() => setReveal((value) => !value)}
              />
              <Button
                label={testing ? "测试中…" : "测试连接"}
                theme={theme}
                compact
                icon={testing ? undefined : "PlugZap"}
                disabled={testing}
                onPress={() => void testConnection()}
              />
              <Button
                label={saving ? "保存中…" : "保存设置"}
                theme={theme}
                compact
                tone="primary"
                icon={saving ? undefined : "Save"}
                disabled={saving}
                onPress={() => void save()}
              />
            </View>
          </View>
        </LabeledField>

        {testState ? <Text style={resultStyle}>{testState.message}</Text> : null}
        {settings.saving ? <Text style={textStyle(theme, 12, true)}>正在写入配置…</Text> : null}
        {settings.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
            {settings.saveError}
          </Text>
        ) : null}
      </Card>

      <Divider theme={theme} />

      <View style={{ gap: 8 }}>
        <Text style={textStyle(theme, 13)}>工单变化通知</Text>
        <Text style={{ ...textStyle(theme, 12, true), lineHeight: 19 }}>
          daemon 会按间隔并发读取所有可访问工作区每个状态最多 100 条工单，发现新增、状态、
          指派或内容变化后，在左上角 AutoWonder 菜单右侧显示提示。更早的工单不在变化检查范围内，
          轮询只读，不会修改数据。
        </Text>
      </View>

      <Card theme={theme}>
        <LabeledField
          label="轮询间隔（秒）"
          error={pollError}
          hint="0 表示关闭，最低 15 秒；建议 30-300 秒。每轮并发检查 5 个状态，每个状态最多 100 条，间隔越短 MCP 压力越大。默认 60 秒。"
          theme={theme}
        >
          <Input
            value={pollSeconds}
            onChangeText={(value) => {
              setPollSeconds(value);
              setPollError(null);
            }}
            placeholder="60"
            theme={theme}
          />
        </LabeledField>
      </Card>

      <Card theme={theme}>
        <SettingsSwitch
          label="风险雷达"
          hint="在工单看板顶部显示停滞、待决策、执行失败和计划未启动等风险统计。默认开启。"
          value={riskRadarEnabled}
          onValueChange={setRiskRadarEnabled}
        />
        <SettingsSwitch
          label="允许自动下载 AutoWonder CLI"
          hint="上传或下载工单文档时，首次会通过 npx 下载 autowonder CLI。关闭时插件不会自动安装任何软件。"
          value={documentCliConsent}
          onValueChange={setDocumentCliConsent}
        />
      </Card>

      <Divider theme={theme} />

      <View style={{ gap: 8 }}>
        <Text style={textStyle(theme, 13)}>连接后可以做什么</Text>
        <Text style={{ ...textStyle(theme, 12, true), lineHeight: 19 }}>
          · 工单：按工作区浏览、筛选、查看正文与评论，执行流转、指派、评论、编辑、暂停/恢复、交付恢复与取消。
          {"\n"}· 数字员工：查看在线状态与版本，提交审核、发布、设置默认 SDLC、绑定仓库与能力。
          {"\n"}· 研发配置：管理 SDLC、流程步骤、小队、仓库与 Repo Map、能力/Skill/MCP、能力分类。
          {"\n"}· 7x24：管理定时任务与运行记录、执行器启动配置与启动命令。
          {"\n"}· 记忆：按组织/小队/数字员工搜索、读取、编辑与删除记忆。
          {"\n"}· 全部工具：内置工具清单与 JSON Schema 表单，任何新工具无需改插件即可调用。
        </Text>
      </View>

      {compact ? (
        <Text style={{ ...textStyle(theme, 11, true), lineHeight: 17 }}>
          移动端只展示核心字段；复杂的 JSON 参数建议在桌面端或工具控制台中编辑。
        </Text>
      ) : null}
    </View>
  );
}

export function AutoWonderSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, paddingBottom: 40 }}
    >
      <SettingsPanel theme={theme} compact={layout.compact} />
    </ScrollView>
  );
}
