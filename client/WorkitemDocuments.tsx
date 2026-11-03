import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import {
  copyText,
  Modal,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  autowonderSettings,
  callToolRpc,
  downloadWorkitemDocumentRpc,
  uploadWorkitemDocumentRpc,
} from "../shared/contracts";
import {
  Button,
  Card,
  Divider,
  Loading,
  Row,
  textStyle,
} from "./components";
import {
  asNumber,
  asString,
  errorMessage,
  formatDateTime,
  listItems,
} from "./lib";

interface DownloadedDocument {
  id?: number;
  name: string;
  path: string;
  size?: number;
}

type PendingAction =
  | { type: "upload"; filePaths: string[] }
  | { type: "download"; fileName?: string };

function formatSize(value: unknown): string {
  const bytes = asNumber(value);
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function WorkitemDocuments({
  workspaceId,
  workitemId,
  theme,
  compact,
  onChanged,
}: {
  workspaceId: number;
  workitemId: number;
  theme: PluginTheme;
  compact: boolean;
  onChanged?: () => void;
}) {
  const call = useRpc(callToolRpc);
  const upload = useRpc(uploadWorkitemDocumentRpc);
  const download = useRpc(downloadWorkitemDocumentRpc);
  const settings = useSettings(autowonderSettings);
  const toast = useToast();
  const [paths, setPaths] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [downloaded, setDownloaded] = useState<DownloadedDocument[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "workitem-documents", workitemId],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_workitem_documents",
        arguments: { workspaceId, id: workitemId },
      });
      if (response.isError) throw new Error(response.contentText ?? "文档加载失败");
      return response.data;
    },
    retry: 1,
  });
  const documents = listItems(documentsQuery.data);
  const consented =
    settings.status === "ready" && settings.values.documentCliConsent;

  async function runUpload(filePaths: string[], allowConsent = false) {
    setBusy("upload");
    try {
      const response = await upload({ workspaceId, workitemId, filePaths });
      if (response.needsConsent && !allowConsent) {
        setPending({ type: "upload", filePaths });
        setConsentOpen(true);
        return;
      }
      if (!response.ok) {
        toast.error(response.error ?? "文档上传失败");
        return;
      }
      toast.show("文档上传完成", { variant: "success" });
      setPaths("");
      await documentsQuery.refetch();
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function runDownload(fileName?: string, allowConsent = false) {
    setBusy("download");
    try {
      const response = await download({ workspaceId, workitemId, fileName });
      if (response.needsConsent && !allowConsent) {
        setPending({ type: "download", fileName });
        setConsentOpen(true);
        return;
      }
      if (!response.ok) {
        toast.error(response.error ?? "文档下载失败");
        return;
      }
      setDownloaded(response.downloaded);
      toast.show(
        response.downloaded.length > 0
          ? `已下载 ${response.downloaded.length} 个文档`
          : "下载完成，但没有返回文件",
        { variant: "success" },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function requestUpload() {
    const filePaths = paths
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (filePaths.length === 0) {
      toast.error("请填写至少一个文件的绝对路径");
      return;
    }
    if (!consented) {
      setPending({ type: "upload", filePaths });
      setConsentOpen(true);
      return;
    }
    void runUpload(filePaths);
  }

  function requestDownload(fileName?: string) {
    if (!consented) {
      setPending({ type: "download", fileName });
      setConsentOpen(true);
      return;
    }
    void runDownload(fileName);
  }

  async function confirmConsent() {
    if (settings.status !== "ready") {
      toast.error("配置尚未加载完成");
      return;
    }
    const saved = await settings.save(
      { ...settings.values, documentCliConsent: true },
      settings.revision,
    );
    if (!saved) {
      toast.error(settings.saveError ?? "保存授权失败");
      return;
    }
    const action = pending;
    setConsentOpen(false);
    setPending(null);
    if (action?.type === "upload") {
      await runUpload(action.filePaths, true);
    } else if (action?.type === "download") {
      await runDownload(action.fileName, true);
    }
  }

  async function deleteDocument(artifactId: number) {
    if (deleteId !== artifactId) {
      setDeleteId(artifactId);
      return;
    }
    setBusy(`delete-${artifactId}`);
    try {
      const response = await call({
        name: "autowonder.delete_workitem_document",
        arguments: { workspaceId, id: workitemId, artifactId },
      });
      if (response.isError) {
        toast.error(response.contentText ?? "删除文档失败");
        return;
      }
      toast.show("文档已删除", { variant: "success" });
      setDeleteId(null);
      await documentsQuery.refetch();
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card theme={theme}>
        <Row gap={8} wrap>
          <Text style={textStyle(theme, 12, true)}>文档</Text>
          <Text style={textStyle(theme, 10, true)}>
            上传/下载通过 AutoWonder CLI，首次使用需要允许下载 CLI。
          </Text>
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            onPress={() => void documentsQuery.refetch()}
          />
        </Row>

        {documentsQuery.isLoading ? <Loading theme={theme} label="读取文档…" /> : null}
        {documentsQuery.error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(documentsQuery.error)}
          </Text>
        ) : null}
        {!documentsQuery.isLoading && !documentsQuery.error && documents.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>暂无附件。</Text>
        ) : null}
        {documents.map((document) => {
          const artifactId = asNumber(document.id);
          const name = asString(document.name) || `文档 #${artifactId ?? "—"}`;
          return (
            <View
              key={String(artifactId ?? name)}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                paddingTop: 9,
                gap: 6,
              }}
            >
              <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 12 }}>
                {name}
              </Text>
              <Text style={textStyle(theme, 10, true)}>
                {asString(document.type) || "文档"} · {formatSize(document.size)} ·{" "}
                {formatDateTime(document.gmtCreate)}
              </Text>
              <Row gap={6} wrap>
                <Button
                  label={busy === "download" ? "下载中…" : "下载"}
                  theme={theme}
                  compact
                  icon="Download"
                  disabled={busy !== null}
                  onPress={() => requestDownload(name)}
                />
                <Button
                  label={
                    busy === `delete-${artifactId}`
                      ? "删除中…"
                      : deleteId === artifactId
                        ? "确认删除"
                        : "删除"
                  }
                  theme={theme}
                  compact
                  tone="danger"
                  icon="Trash2"
                  disabled={busy !== null || artifactId === undefined}
                  onPress={() => {
                    if (artifactId !== undefined) void deleteDocument(artifactId);
                  }}
                />
                {deleteId === artifactId ? (
                  <Text style={{ color: theme.colors.statusWarning, fontSize: 10 }}>
                    再点一次确认删除
                  </Text>
                ) : null}
              </Row>
            </View>
          );
        })}

        <Divider theme={theme} />
        <Text style={textStyle(theme, 11, true)}>
          上传文件路径（每行一个，绝对路径，最多 10 个，单个 5MB）
        </Text>
        <TextInput
          value={paths}
          onChangeText={setPaths}
          multiline
          placeholder="/absolute/path/design.md"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={{
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface0,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            padding: 10,
            minHeight: compact ? 68 : 82,
            fontSize: 12,
            textAlignVertical: "top",
          }}
        />
        <Row gap={7} wrap>
          <Button
            label={busy === "upload" ? "上传中…" : "上传文档"}
            theme={theme}
            tone="primary"
            compact
            icon="Upload"
            disabled={busy !== null || paths.trim() === ""}
            onPress={requestUpload}
          />
          <Button
            label="全部下载"
            theme={theme}
            compact
            icon="Download"
            disabled={busy !== null || documents.length === 0}
            onPress={() => requestDownload()}
          />
        </Row>

        {downloaded.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={textStyle(theme, 11, true)}>已下载到本机：</Text>
            {downloaded.map((file) => (
              <Text
                key={file.path}
                selectable
                style={{ color: theme.colors.foreground, fontSize: 11 }}
              >
                {file.path}
              </Text>
            ))}
            <Button
              label="复制全部路径"
              theme={theme}
              compact
              icon="Copy"
              onPress={() => {
                void copyText(downloaded.map((file) => file.path).join("\n"))
                  .then(() => toast.show("路径已复制", { variant: "success" }))
                  .catch(() => toast.error("复制失败"));
              }}
            />
          </View>
        ) : null}
      </Card>

      {consentOpen ? (
        <Modal
          title="允许下载 AutoWonder CLI"
          open
          onOpenChange={(next) => {
            if (!next) {
              setConsentOpen(false);
              setPending(null);
            }
          }}
        >
          <Modal.Content>
            <Card theme={theme}>
              <Text style={textStyle(theme, 12)}>
                上传和下载工单文档需要 AutoWonder CLI。插件会通过 `npx -y autowonder@版本号`
                从 npm 下载并运行该 CLI；如果关闭或取消，不会安装任何软件。
              </Text>
              <Text style={textStyle(theme, 11, true)}>
                CLI 只在本次操作中运行，token 由 AutoWonder MCP 临时签发，不会写入磁盘。
              </Text>
              <Row gap={8} wrap>
                <Button
                  label="允许并继续"
                  theme={theme}
                  tone="primary"
                  compact
                  icon="Check"
                  disabled={busy !== null}
                  onPress={() => void confirmConsent()}
                />
                <Button
                  label="取消"
                  theme={theme}
                  compact
                  onPress={() => {
                    setConsentOpen(false);
                    setPending(null);
                  }}
                />
              </Row>
            </Card>
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  );
}
