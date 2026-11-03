import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { WorkitemChange } from "../shared/contracts";

const STORE_VERSION = 1;
const CHANGE_KINDS = new Set<WorkitemChange["changes"][number]>([
  "new",
  "status",
  "assignee",
  "updated",
]);

interface StoredNotificationState {
  version: number;
  urlHash: string;
  revision: number;
  changes: WorkitemChange[];
}

export interface NotificationStore {
  load(urlHash: string): { revision: number; changes: WorkitemChange[] } | null;
  save(urlHash: string, revision: number, changes: WorkitemChange[]): void;
  clear(urlHash: string): void;
}

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

function normalizeChange(value: unknown): WorkitemChange | null {
  if (!isRecord(value)) return null;
  const key = asString(value.key);
  const revision = asNumber(value.revision);
  const workspaceId = asNumber(value.workspaceId);
  const id = asNumber(value.id);
  if (!key || revision === undefined || workspaceId === undefined || id === undefined) return null;
  const changes = Array.isArray(value.changes)
    ? value.changes.filter(
        (change): change is WorkitemChange["changes"][number] =>
          typeof change === "string" && CHANGE_KINDS.has(change as WorkitemChange["changes"][number]),
      )
    : [];
  return {
    key,
    revision,
    read: typeof value.read === "boolean" ? value.read : true,
    updatedAt:
      asString(value.updatedAt) || asString(value.gmtModified) || new Date(0).toISOString(),
    workspaceId,
    workspaceName: asString(value.workspaceName) || undefined,
    id,
    title: asString(value.title),
    workType: asString(value.workType) || undefined,
    statusName: asString(value.statusName) || undefined,
    changes,
    oldStatusName: asString(value.oldStatusName) || undefined,
    newStatusName: asString(value.newStatusName) || undefined,
    oldAssignee: asString(value.oldAssignee) || undefined,
    newAssignee: asString(value.newAssignee) || undefined,
    gmtModified: asString(value.gmtModified) || undefined,
  };
}

export function hashMcpUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function defaultNotificationPath(): string {
  return path.join(
    homedir(),
    ".paseo",
    "plugin-data",
    "autowonder-workbench",
    "notifications.json",
  );
}

export class FileNotificationStore implements NotificationStore {
  constructor(private readonly filePath = defaultNotificationPath()) {}

  load(urlHash: string): { revision: number; changes: WorkitemChange[] } | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
      if (!isRecord(raw) || raw.version !== STORE_VERSION || raw.urlHash !== urlHash) return null;
      const revision = asNumber(raw.revision) ?? 0;
      const changes = Array.isArray(raw.changes)
        ? raw.changes
            .map(normalizeChange)
            .filter((change): change is WorkitemChange => change !== null)
        : [];
      return { revision, changes };
    } catch {
      return null;
    }
  }

  save(urlHash: string, revision: number, changes: WorkitemChange[]): void {
    const state: StoredNotificationState = {
      version: STORE_VERSION,
      urlHash,
      revision,
      changes,
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  clear(urlHash: string): void {
    this.save(urlHash, 0, []);
  }
}

export class MemoryNotificationStore implements NotificationStore {
  private state: StoredNotificationState | null = null;

  load(urlHash: string): { revision: number; changes: WorkitemChange[] } | null {
    if (!this.state || this.state.urlHash !== urlHash) return null;
    return { revision: this.state.revision, changes: [...this.state.changes] };
  }

  save(urlHash: string, revision: number, changes: WorkitemChange[]): void {
    this.state = { version: STORE_VERSION, urlHash, revision, changes: [...changes] };
  }

  clear(urlHash: string): void {
    this.state = { version: STORE_VERSION, urlHash, revision: 0, changes: [] };
  }
}
