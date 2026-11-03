import {
  WORKITEM_STATUS_CATEGORIES,
  WORKITEMS_PER_STATUS,
  type ChangeState,
  type WorkitemChange,
} from "../shared/contracts";
import { callTool } from "./mcp";
import {
  FileNotificationStore,
  hashMcpUrl,
  type NotificationStore,
} from "./notification-store";

interface ProjectSnapshot {
  id: number;
  name: string;
}

interface WorkitemSnapshot {
  id: number;
  title: string;
  workType: string;
  statusName: string;
  statusNodeId: number | undefined;
  statusCategory: string;
  assigneeType: string;
  assigneeRef: number | undefined;
  assigneeLabel: string;
  version: number | undefined;
  gmtModified: string;
}

type ChangeKind = WorkitemChange["changes"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

async function toolData(
  url: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await callTool(url, name, args);
  if (response.isError) {
    throw new Error(response.contentText || `${name} 调用失败`);
  }
  return isRecord(response.data) ? response.data : {};
}

export type ToolFetcher = (
  url: string,
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

function assigneeLabel(item: Record<string, unknown>): string {
  const name = asString(item.assigneeName);
  const ref = asNumber(item.assigneeRef);
  if (name) return `${name}${ref !== undefined ? ` #${ref}` : ""}`;
  return asString(item.assigneeDisplayName) || "未指派";
}

function snapshotOf(item: Record<string, unknown>): WorkitemSnapshot | null {
  const id = asNumber(item.id);
  if (id === undefined) return null;
  return {
    id,
    title: asString(item.title),
    workType: asString(item.workType),
    statusName: asString(item.statusName),
    statusNodeId: asNumber(item.statusNodeId),
    statusCategory: asString(item.statusCategory),
    assigneeType: asString(item.assigneeType),
    assigneeRef: asNumber(item.assigneeRef),
    assigneeLabel: assigneeLabel(item),
    version: asNumber(item.version),
    gmtModified: asString(item.gmtModified),
  };
}

function isNewerSnapshot(next: WorkitemSnapshot, previous: WorkitemSnapshot): boolean {
  const nextVersion = next.version ?? -1;
  const previousVersion = previous.version ?? -1;
  if (nextVersion !== previousVersion) return nextVersion > previousVersion;
  return next.gmtModified > previous.gmtModified;
}

export class ChangeTracker {
  constructor(
    private readonly fetchTool: ToolFetcher = toolData,
    private readonly store: NotificationStore = new FileNotificationStore(),
  ) {}

  private url = "";
  private urlHash = "";
  private intervalSeconds = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling: Promise<void> | null = null;
  private snapshots = new Map<number, Map<number, WorkitemSnapshot>>();
  private changes = new Map<string, WorkitemChange>();
  private revision = 0;
  private lastPollAt: string | undefined;
  private error: string | undefined;
  private generation = 0;

  configure(url: string, intervalSeconds: number): void {
    this.generation += 1;
    const rawInterval = Number.isFinite(intervalSeconds) ? Math.trunc(intervalSeconds) : 0;
    const interval =
      rawInterval === 0 ? 0 : Math.max(15, Math.min(3600, rawInterval));
    const urlChanged = url !== this.url;
    const wasOff = this.intervalSeconds === 0;
    const wasOn = this.intervalSeconds > 0;
    this.url = url;
    this.intervalSeconds = interval;

    if (urlChanged) {
      this.urlHash = url ? hashMcpUrl(url) : "";
      this.resetAll();
      this.restore();
    } else if ((wasOff && interval > 0) || (wasOn && interval === 0)) {
      this.resetRuntime();
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (interval > 0 && url) {
      if (!this.lastPollAt) {
        void this.pollNow();
      }
      this.timer = setInterval(() => {
        void this.pollNow();
      }, interval * 1000);
    }
  }

  async pollNow(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.runPoll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  getState(): ChangeState {
    const sorted = [...this.changes.values()].sort(
      (a, b) =>
        b.revision - a.revision ||
        (b.gmtModified ?? "").localeCompare(a.gmtModified ?? "") ||
        a.id - b.id,
    );
    const unacked = sorted.filter((change) => !change.read);
    let ackRevision = 0;
    for (const change of sorted) {
      if (change.read) ackRevision = Math.max(ackRevision, change.revision);
    }
    let newCount = 0;
    let statusCount = 0;
    let assigneeCount = 0;
    let updatedCount = 0;
    for (const change of unacked) {
      if (change.changes.includes("new")) newCount += 1;
      if (change.changes.includes("status")) statusCount += 1;
      if (change.changes.includes("assignee")) assigneeCount += 1;
      if (change.changes.includes("updated")) updatedCount += 1;
    }
    return {
      revision: this.revision,
      ackRevision,
      intervalSeconds: this.intervalSeconds,
      lastPollAt: this.lastPollAt,
      error: this.error,
      newCount,
      statusCount,
      assigneeCount,
      updatedCount,
      totalCount: unacked.length,
      items: unacked.slice(0, 50),
      history: sorted.slice(0, 200),
    };
  }

  ack(): ChangeState {
    for (const change of this.changes.values()) {
      change.read = true;
    }
    this.persist();
    return this.getState();
  }

  ackOne(key: string): ChangeState {
    const change = this.changes.get(key);
    if (change) {
      change.read = true;
      this.persist();
    }
    return this.getState();
  }

  async refresh(): Promise<ChangeState> {
    await this.pollNow();
    return this.getState();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resetRuntime(): void {
    this.snapshots = new Map();
    this.lastPollAt = undefined;
    this.error = undefined;
  }

  private resetAll(): void {
    this.resetRuntime();
    this.changes = new Map();
    this.revision = 0;
  }

  private restore(): void {
    if (!this.urlHash) return;
    const stored = this.store.load(this.urlHash);
    if (!stored) return;
    this.revision = stored.revision;
    this.changes = new Map(stored.changes.map((change) => [change.key, change]));
  }

  private persist(): void {
    if (!this.urlHash) return;
    this.store.save(this.urlHash, this.revision, [...this.changes.values()]);
  }

  private prune(): void {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const sorted = [...this.changes.values()].sort(
      (a, b) => b.revision - a.revision,
    );
    const keep = new Set(
      sorted
        .filter((change, index) => {
          if (index >= 500) return false;
          const timestamp = Date.parse(change.updatedAt);
          return !Number.isFinite(timestamp) || timestamp >= cutoff;
        })
        .map((change) => change.key),
    );
    for (const key of this.changes.keys()) {
      if (!keep.has(key)) this.changes.delete(key);
    }
  }

  private async runPoll(): Promise<void> {
    const generation = this.generation;
    if (!this.url) {
      if (generation === this.generation) this.error = "尚未配置 MCP URL";
      return;
    }
    try {
      const projectsData = await this.fetchTool(this.url, "autowonder.list_projects", {});
      const projects: ProjectSnapshot[] = asArray(projectsData.items)
        .map((item) => {
          const record = isRecord(item) ? item : {};
          const id = asNumber(record.id);
          if (id === undefined) return null;
          return { id, name: asString(record.name) };
        })
        .filter((project): project is ProjectSnapshot => project !== null);

      const nextSnapshots = new Map<number, Map<number, WorkitemSnapshot>>();
      for (const project of projects) {
        const responses = await Promise.all(
          WORKITEM_STATUS_CATEGORIES.map((statusCategory) =>
            this.fetchTool(this.url, "autowonder.list_workitems", {
              workspaceId: project.id,
              statusCategory,
              size: WORKITEMS_PER_STATUS,
            }),
          ),
        );
        const items = new Map<number, WorkitemSnapshot>();
        for (const data of responses) {
          for (const raw of asArray(data.items)) {
            const snapshot = snapshotOf(isRecord(raw) ? raw : {});
            if (!snapshot) continue;
            const existing = items.get(snapshot.id);
            if (!existing || isNewerSnapshot(snapshot, existing)) {
              items.set(snapshot.id, snapshot);
            }
          }
        }
        nextSnapshots.set(project.id, items);
      }

      if (generation !== this.generation) return;
      const nextRevision = this.revision + 1;
      for (const project of projects) {
        const previous = this.snapshots.get(project.id);
        const next = nextSnapshots.get(project.id) ?? new Map();
        if (!previous) continue;
        for (const [id, current] of next) {
          const old = previous.get(id);
          const changes: ChangeKind[] = [];
          if (!old) {
            changes.push("new");
          } else {
            if (
              old.statusNodeId !== current.statusNodeId ||
              old.statusName !== current.statusName
            ) {
              changes.push("status");
            }
            if (
              old.assigneeType !== current.assigneeType ||
              old.assigneeRef !== current.assigneeRef
            ) {
              changes.push("assignee");
            }
            if (
              changes.length === 0 &&
              (old.version !== current.version || old.gmtModified !== current.gmtModified)
            ) {
              changes.push("updated");
            }
          }
          if (changes.length > 0) {
            this.recordChange(project, current, old, changes, nextRevision);
          }
        }
      }

      this.snapshots = nextSnapshots;
      this.revision = nextRevision;
      this.lastPollAt = new Date().toISOString();
      this.error = undefined;
      this.prune();
      this.persist();
    } catch (error) {
      if (generation !== this.generation) return;
      this.lastPollAt = new Date().toISOString();
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private recordChange(
    project: ProjectSnapshot,
    current: WorkitemSnapshot,
    previous: WorkitemSnapshot | undefined,
    changes: ChangeKind[],
    revision: number,
  ): void {
    const key = `${project.id}:${current.id}`;
    const existing = this.changes.get(key);
    const activeExisting = existing && !existing.read ? existing : undefined;
    const merged = new Set<ChangeKind>(activeExisting?.changes ?? []);
    for (const change of changes) merged.add(change);
    const oldStatusName =
      activeExisting?.oldStatusName ??
      (merged.has("status") ? previous?.statusName || "未知状态" : undefined);
    const oldAssignee =
      activeExisting?.oldAssignee ??
      (merged.has("assignee") ? previous?.assigneeLabel || "未指派" : undefined);
    this.changes.set(key, {
      key,
      revision,
      read: false,
      updatedAt: new Date().toISOString(),
      workspaceId: project.id,
      workspaceName: project.name,
      id: current.id,
      title: current.title,
      workType: current.workType,
      statusName: current.statusName,
      changes: [...merged],
      oldStatusName,
      newStatusName: current.statusName,
      oldAssignee,
      newAssignee: current.assigneeLabel,
      gmtModified: current.gmtModified,
    });
  }
}
