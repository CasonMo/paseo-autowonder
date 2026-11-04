import { execCommand } from "@getpaseo/plugin/server";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { callTool } from "./mcp";

interface CliToken {
  token: string;
  envName: string;
  runtimeVersion: string;
  serverUrl: string;
}

export interface DownloadedDocument {
  id?: number;
  name: string;
  path: string;
  size?: number;
}

export interface DownloadResult {
  ok: boolean;
  outputDir?: string;
  downloaded: DownloadedDocument[];
  output?: string;
  error?: string;
  needsConsent?: boolean;
}

export interface PreviewResult {
  ok: boolean;
  name?: string;
  content?: string;
  truncated?: boolean;
  error?: string;
  needsConsent?: boolean;
}

const PREVIEW_MAX_BYTES = 512 * 1024;
const PREVIEW_MAX_CHARS = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sanitize(value: string, secrets: string[]): string {
  let output = value;
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join("***");
  }
  return output
    .replace(
      /AUTOWONDER_[A-Z_]+TOKEN=(?:'[^']*'|"[^"]*"|\S+)/g,
      "AUTOWONDER_TOKEN=***",
    )
    .slice(0, 8000);
}

async function mintCliToken(
  url: string,
  toolName: string,
  workspaceId: number,
  workitemId: number,
): Promise<CliToken> {
  const response = await callTool(url, toolName, { workspaceId, id: workitemId });
  if (response.isError) {
    throw new Error(response.contentText || `${toolName} 调用失败`);
  }
  const data = isRecord(response.data) ? response.data : {};
  const token = asString(data.token);
  const serverUrl = asString(data.serverUrl);
  if (!token || !serverUrl) {
    throw new Error("AutoWonder 没有返回可用的文档下载 token。");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    throw new Error("AutoWonder 返回的文档服务地址不合法。");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("AutoWonder 返回的文档服务地址仅支持 http 或 https。");
  }
  const envName = asString(data.tokenEnvName) || "AUTOWONDER_TOKEN";
  if (!/^AUTOWONDER_[A-Z_]*TOKEN$/.test(envName)) {
    throw new Error("AutoWonder 返回的 CLI token 环境变量名不合法。");
  }
  const runtimeVersion = asString(data.runtimeVersion);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(runtimeVersion)) {
    throw new Error("AutoWonder 返回的 CLI 版本号不合法。");
  }
  return {
    token,
    envName,
    runtimeVersion,
    serverUrl,
  };
}

function errorText(error: unknown, secrets: string[]): string {
  if (error instanceof Error) {
    const stdout = isRecord(error) ? asString(error.stdout) : "";
    const stderr = isRecord(error) ? asString(error.stderr) : "";
    return sanitize(stderr || stdout || error.message, secrets);
  }
  return sanitize(String(error), secrets);
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function walkFiles(directory: string): DownloadedDocument[] {
  const result: DownloadedDocument[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        result.push({
          name: path.relative(directory, fullPath).split(path.sep).join("/"),
          path: fullPath,
          size: stat.size,
        });
      }
    }
  };
  visit(directory);
  return result;
}

function isProbablyText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  let control = 0;
  for (const byte of buffer) {
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return buffer.length === 0 || control / buffer.length < 0.02;
}

export function readPreviewText(
  outputDir: string,
  file: DownloadedDocument,
): PreviewResult {
  try {
    const outputRoot = fs.realpathSync(outputDir);
    const realPath = fs.realpathSync(file.path);
    const relative = path.relative(outputRoot, realPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return { ok: false, error: "文档名称不合法。" };
    }
    const stat = fs.statSync(realPath);
    if (stat.size > PREVIEW_MAX_BYTES) {
      return {
        ok: false,
        error: "文档过大，暂不支持预览，请下载后查看。",
      };
    }
    const buffer = fs.readFileSync(realPath);
    if (!isProbablyText(buffer)) {
      return {
        ok: false,
        error: "该文档不是可预览的文本文件，请下载后查看。",
      };
    }
    const text = buffer.toString("utf8");
    const truncated = text.length > PREVIEW_MAX_CHARS;
    return {
      ok: true,
      name: file.name,
      content: truncated ? text.slice(0, PREVIEW_MAX_CHARS) : text,
      truncated,
    };
  } catch {
    return { ok: false, error: "读取文档内容失败。" };
  }
}

export async function downloadWorkitemDocument(
  url: string,
  workspaceId: number,
  workitemId: number,
  fileName: string | undefined,
  consented: boolean,
): Promise<DownloadResult> {
  if (!consented) {
    return {
      ok: false,
      downloaded: [],
      needsConsent: true,
      error: "下载文档需要先允许插件通过 npx 下载并运行 AutoWonder CLI。",
    };
  }
  const trimmedName = fileName?.trim() ?? "";
  if (trimmedName.includes("..") || trimmedName.startsWith("/") || trimmedName.startsWith("\\")) {
    return { ok: false, downloaded: [], error: "文档名称不合法。" };
  }
  let token: CliToken | null = null;
  try {
    token = await mintCliToken(
      url,
      "autowonder.workitem_cli_download_token",
      workspaceId,
      workitemId,
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(
      homedir(),
      ".paseo",
      "plugin-data",
      "autowonder-workbench",
      "documents",
      String(workspaceId),
      String(workitemId),
      timestamp,
    );
    fs.mkdirSync(outputDir, { recursive: true });
    const args = [
      "-y",
      `autowonder@${token.runtimeVersion}`,
      "workitem",
      "download",
      "--server-url",
      token.serverUrl,
      "--workitem-id",
      String(workitemId),
      "--output-dir",
      outputDir,
    ];
    if (trimmedName) args.push("--file", trimmedName);
    args.push("--json");
    const result = await execCommand("npx", args, {
      env: { ...process.env, [token.envName]: token.token },
      timeout: 180_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsed = parseJson(result.stdout);
    const rawDownloaded = Array.isArray(parsed?.downloaded) ? parsed.downloaded : [];
    const downloaded = rawDownloaded.flatMap((entry): DownloadedDocument[] => {
        const record = isRecord(entry) ? entry : {};
        const filePath = asString(record.path);
        const name = asString(record.name) || path.basename(filePath);
        if (!filePath || !name) return [];
        const relative = path.relative(outputDir, filePath);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return [];
        return [{
          id: asNumber(record.id),
          name,
          path: filePath,
          size: asNumber(record.size),
        }];
      });
    return {
      ok: true,
      outputDir,
      downloaded: downloaded.length > 0 ? downloaded : walkFiles(outputDir),
      output: sanitize(result.stdout || result.stderr, [token.token]),
    };
  } catch (error) {
    return {
      ok: false,
      downloaded: [],
      error: errorText(error, token ? [token.token] : []),
    };
  }
}

export async function previewWorkitemDocument(
  url: string,
  workspaceId: number,
  workitemId: number,
  fileName: string,
  consented: boolean,
): Promise<PreviewResult> {
  if (!consented) {
    return {
      ok: false,
      needsConsent: true,
      error: "下载文档需要先允许插件通过 npx 下载并运行 AutoWonder CLI。",
    };
  }
  const trimmedName = fileName.trim();
  if (
    !trimmedName ||
    trimmedName.includes("..") ||
    trimmedName.startsWith("/") ||
    trimmedName.startsWith("\\")
  ) {
    return { ok: false, error: "文档名称不合法。" };
  }
  const downloaded = await downloadWorkitemDocument(
    url,
    workspaceId,
    workitemId,
    trimmedName,
    true,
  );
  if (!downloaded.ok || !downloaded.outputDir) {
    return {
      ok: false,
      error: downloaded.error || "文档预览失败。",
      needsConsent: downloaded.needsConsent,
    };
  }
  const file =
    downloaded.downloaded.find(
      (item) =>
        item.name === trimmedName ||
        path.basename(item.name) === path.basename(trimmedName),
    ) ?? downloaded.downloaded[0];
  if (!file) {
    return { ok: false, error: "下载完成，但没有返回文件。" };
  }
  return readPreviewText(downloaded.outputDir, file);
}
