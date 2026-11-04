import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";
import {
  autowonderSettings,
  callToolRpc,
  downloadWorkitemDocumentRpc,
  previewWorkitemDocumentRpc,
} from "../shared/contracts";
import {
  Button,
  Card,
  Loading,
  MarkdownBlock,
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

interface PreviewState {
  name: string;
  content: string;
  truncated?: boolean;
}

type PendingAction = { fileName?: string; mode: "download" | "preview" };

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
  const { t } = useI18n();
  const call = useRpc(callToolRpc);
  const download = useRpc(downloadWorkitemDocumentRpc);
  const preview = useRpc(previewWorkitemDocumentRpc);
  const settings = useSettings(autowonderSettings);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [downloaded, setDownloaded] = useState<DownloadedDocument[]>([]);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
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

  async function runDownload(fileName?: string, allowConsent = false) {
    setBusy("download");
    try {
      const response = await download({ workspaceId, workitemId, fileName });
      if (response.needsConsent && !allowConsent) {
        setPending({ fileName, mode: "download" });
        setConsentOpen(true);
        return;
      }
      if (!response.ok) {
        toast.error(response.error ?? t("文档下载失败"));
        return;
      }
      setDownloaded(response.downloaded);
      toast.show(
        response.downloaded.length > 0
          ? t("已下载 {{count}} 个文档", { count: response.downloaded.length })
          : t("下载完成，但没有返回文件"),
        { variant: "success" },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function requestDownload(fileName?: string) {
    if (!consented) {
      setPending({ fileName, mode: "download" });
      setConsentOpen(true);
      return;
    }
    void runDownload(fileName);
  }

  async function runPreview(fileName: string, allowConsent = false) {
    setBusy("preview");
    try {
      const response = await preview({ workspaceId, workitemId, fileName });
      if (response.needsConsent && !allowConsent) {
        setPending({ fileName, mode: "preview" });
        setConsentOpen(true);
        return;
      }
      if (!response.ok) {
        toast.error(response.error ?? t("文档预览失败。"));
        return;
      }
      setPreviewState({
        name: response.name ?? fileName,
        content: response.content ?? "",
        truncated: response.truncated,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function requestPreview(fileName: string) {
    if (!consented) {
      setPending({ fileName, mode: "preview" });
      setConsentOpen(true);
      return;
    }
    void runPreview(fileName);
  }

  async function confirmConsent() {
    if (settings.status !== "ready") {
      toast.error(t("配置尚未加载完成"));
      return;
    }
    const saved = await settings.save(
      { ...settings.values, documentCliConsent: true },
      settings.revision,
    );
    if (!saved) {
      toast.error(settings.saveError ?? t("保存授权失败"));
      return;
    }
    const action = pending;
    setConsentOpen(false);
    setPending(null);
    if (action) {
      if (action.mode === "preview" && action.fileName) {
        await runPreview(action.fileName, true);
      } else {
        await runDownload(action.fileName, true);
      }
    }
  }

  async function deleteDocument(artifactId: number) {
    if (deleteId !== artifactId) {
      setDeleteId(artifactId);
      toast.show(t("再点一次删除"), { variant: "warning" });
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
      toast.show(t("文档已删除"), { variant: "success" });
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
            {t("下载通过 AutoWonder CLI，首次使用需要允许下载 CLI。")}
          </Text>
          <Button
            label="刷新"
            theme={theme}
            compact
            icon="RefreshCw"
            onPress={() => void documentsQuery.refetch()}
          />
          <Button
            label={busy === "download" ? "下载中…" : "全部下载"}
            theme={theme}
            compact
            icon="Download"
            disabled={busy !== null || documents.length === 0}
            onPress={() => requestDownload()}
          />
        </Row>

        {documentsQuery.isLoading ? <Loading theme={theme} label="读取文档…" /> : null}
        {documentsQuery.error ? (
          <Text translate={false} style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {errorMessage(documentsQuery.error)}
          </Text>
        ) : null}
        {!documentsQuery.isLoading && !documentsQuery.error && documents.length === 0 ? (
          <Text style={textStyle(theme, 11, true)}>暂无附件。</Text>
        ) : null}
        {documents.map((document) => {
          const artifactId = asNumber(document.id);
          const fileName = asString(document.name);
          const name =
            fileName || t("文档 #{{id}}", { id: artifactId ?? "—" });
          const meta = [
            asString(document.type) || t("文档"),
            formatSize(document.size),
            compact ? "" : formatDateTime(document.gmtCreate),
          ]
            .filter(Boolean)
            .join(" · ");
          const confirmingDelete = deleteId === artifactId;
          return (
            <View
              key={String(artifactId ?? name)}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                paddingTop: 9,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.foreground,
                    fontSize: 12,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {name}
                </Text>
                <Text numberOfLines={1} style={{ ...textStyle(theme, 10, true), flexShrink: 1 }}>
                  {meta}
                </Text>
                {fileName ? (
                  <Button
                    label={busy === "preview" ? t("加载中…") : t("预览")}
                    theme={theme}
                    compact
                    iconOnly
                    icon="Eye"
                    disabled={busy !== null}
                    onPress={() => requestPreview(fileName)}
                  />
                ) : null}
                <Button
                  label={busy === "download" ? "下载中…" : "下载"}
                  theme={theme}
                  compact
                  iconOnly
                  icon="Download"
                  disabled={busy !== null || !fileName}
                  onPress={() => requestDownload(fileName)}
                />
                <Button
                  label={
                    busy === `delete-${artifactId}`
                      ? "删除中…"
                      : confirmingDelete
                        ? "确认删除"
                        : "删除"
                  }
                  theme={theme}
                  compact
                  tone="danger"
                  iconOnly
                  icon={confirmingDelete ? "AlertTriangle" : "Trash2"}
                  disabled={busy !== null || artifactId === undefined}
                  onPress={() => {
                    if (artifactId !== undefined) void deleteDocument(artifactId);
                  }}
                />
              </View>
            </View>
          );
        })}

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
                  .then(() => toast.show(t("路径已复制"), { variant: "success" }))
                  .catch(() => toast.error(t("复制失败")));
              }}
            />
          </View>
        ) : null}
      </Card>

      {previewState ? (
        <Modal
          title={previewState.name}
          open
          onOpenChange={(next) => {
            if (!next) setPreviewState(null);
          }}
        >
          <Modal.Content>
            <Card theme={theme}>
              {previewState.truncated ? (
                <Text style={textStyle(theme, 11, true)}>
                  {t("预览内容过大，仅显示前 {{count}} 个字符。", {
                    count: previewState.content.length,
                  })}
                </Text>
              ) : null}
              {previewState.content.trim() ? (
                <MarkdownBlock
                  text={previewState.content}
                  theme={theme}
                  maxHeight={compact ? 360 : 560}
                />
              ) : (
                <Text style={textStyle(theme, 12, true)}>{t("文档内容为空。")}</Text>
              )}
            </Card>
          </Modal.Content>
        </Modal>
      ) : null}

      {consentOpen ? (
        <Modal
          title={t("允许下载 AutoWonder CLI")}
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
                {t(
                  "下载工单文档需要 AutoWonder CLI。插件会通过 `npx -y autowonder@版本号` 从 npm 下载并运行该 CLI；如果关闭或取消，不会安装任何软件。",
                )}
              </Text>
              <Text style={textStyle(theme, 11, true)}>
                {t(
                  "CLI 只在本次操作中运行，token 由 AutoWonder MCP 临时签发，不会写入磁盘。",
                )}
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
