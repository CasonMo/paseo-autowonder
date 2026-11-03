import assert from "node:assert/strict";
import test from "node:test";
import { ChangeTracker, type ToolFetcher } from "../server/changes";
import { MemoryNotificationStore } from "../server/notification-store";

interface FakeItem {
  id: number;
  title: string;
  workType: string;
  statusName: string;
  statusNodeId: number;
  statusCategory: string;
  assigneeType: string;
  assigneeRef: number;
  assigneeName: string;
  version: number;
  gmtModified: string;
}

function item(overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: 101,
    title: "示例工单",
    workType: "REQ",
    statusName: "待处理",
    statusNodeId: 11,
    statusCategory: "NEW",
    assigneeType: "AGENT",
    assigneeRef: 11,
    assigneeName: "Nova",
    version: 1,
    gmtModified: "2026-11-03T10:00:00.000Z",
    ...overrides,
  };
}

function fetcher<T extends { statusCategory: string }>(read: () => T[]): ToolFetcher {
  return async (_url, name, args) => {
    if (name === "autowonder.list_projects") {
      return { items: [{ id: 1, name: "示例工作区" }] };
    }
    if (name === "autowonder.list_workitems") {
      const category = String(args.statusCategory ?? "");
      return { items: read().filter((entry) => entry.statusCategory === category) };
    }
    return { items: [] };
  };
}

test("first poll is a baseline and does not notify", async () => {
  let current = [item()];
  const tracker = new ChangeTracker(
    fetcher(() => current),
    new MemoryNotificationStore(),
  );
  tracker.configure("https://example.test/mcp", 0);
  await tracker.pollNow();
  assert.equal(tracker.getState().totalCount, 0);
  assert.equal(tracker.getState().history.length, 0);
});

test("status and assignee changes are merged into one unread notification", async () => {
  let current = [item()];
  const store = new MemoryNotificationStore();
  const tracker = new ChangeTracker(fetcher(() => current), store);
  tracker.configure("https://example.test/mcp", 0);
  await tracker.pollNow();
  current = [
    item({
      statusName: "执行中",
      statusNodeId: 12,
      statusCategory: "IN_PROGRESS",
      assigneeRef: 12,
      assigneeName: "Orion",
      version: 2,
      gmtModified: "2026-11-03T10:01:00.000Z",
    }),
  ];
  await tracker.pollNow();
  const state = tracker.getState();
  assert.equal(state.totalCount, 1);
  assert.deepEqual(state.items[0].changes.sort(), ["assignee", "status"]);
  assert.equal(state.items[0].read, false);
  assert.equal(state.history.length, 1);
});

test("content-only changes are reported as updated", async () => {
  let current = [item()];
  const tracker = new ChangeTracker(
    fetcher(() => current),
    new MemoryNotificationStore(),
  );
  tracker.configure("https://example.test/mcp", 0);
  await tracker.pollNow();
  current = [
    item({
      title: "示例工单（已修改）",
      version: 2,
      gmtModified: "2026-11-03T10:02:00.000Z",
    }),
  ];
  await tracker.pollNow();
  assert.deepEqual(tracker.getState().items[0].changes, ["updated"]);
});

test("read state survives a tracker restart for the same MCP URL", async () => {
  let current = [item()];
  const store = new MemoryNotificationStore();
  const first = new ChangeTracker(fetcher(() => current), store);
  first.configure("https://example.test/mcp", 0);
  await first.pollNow();
  current = [item({ version: 2, gmtModified: "2026-11-03T10:03:00.000Z" })];
  await first.pollNow();
  const key = first.getState().items[0].key;
  first.ackOne(key);
  assert.equal(first.getState().totalCount, 0);
  assert.equal(first.getState().history[0].read, true);

  const second = new ChangeTracker(fetcher(() => current), store);
  second.configure("https://example.test/mcp", 0);
  assert.equal(second.getState().history.length, 1);
  assert.equal(second.getState().history[0].read, true);
  assert.equal(second.getState().totalCount, 0);
});

test("a different MCP URL does not inherit notifications", async () => {
  let current = [item()];
  const store = new MemoryNotificationStore();
  const tracker = new ChangeTracker(fetcher(() => current), store);
  tracker.configure("https://example.test/mcp-a", 0);
  await tracker.pollNow();
  current = [item({ version: 2, gmtModified: "2026-11-03T10:04:00.000Z" })];
  await tracker.pollNow();
  assert.equal(tracker.getState().totalCount, 1);

  tracker.configure("https://example.test/mcp-b", 0);
  assert.equal(tracker.getState().history.length, 0);
  assert.equal(tracker.getState().totalCount, 0);
});
