export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function listItems(data: unknown, key = "items"): Record<string, unknown>[] {
  const record = asRecord(data);
  return asArray(record[key]).map(asRecord);
}

export function formatDateTime(value: unknown): string {
  const text = asString(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
      .join("、");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function jsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}

export function statusTone(value: string): "success" | "warning" | "danger" | "accent" | "muted" {
  if (["在线", "已完成", "已启用", "成功", "运行中"].includes(value)) return "success";
  if (["待决策", "待审核", "已暂停", "待处理"].includes(value)) return "warning";
  if (["失败", "已取消", "已归档", "已停用", "离线"].includes(value)) return "danger";
  if (["进行中", "执行中"].includes(value)) return "accent";
  const upper = value.toUpperCase();
  if (["ONLINE", "SUCCEEDED", "DONE", "ENABLED", "ACTIVE", "ADMIN", "READ_WRITE", "OK"].includes(upper)) {
    return "success";
  }
  if (["PENDING_DECISION", "PENDING_REVIEW", "PAUSED", "WARNING", "EXHAUSTED"].includes(upper)) {
    return "warning";
  }
  if (["FAILED", "ERROR", "CANCELED", "CANCELLED", "OFFLINE", "DISABLED", "ARCHIVED"].includes(upper)) {
    return "danger";
  }
  if (["RUNNING", "IN_PROGRESS", "DISPATCHED", "ACKED", "ONLINE"].includes(upper)) {
    return "accent";
  }
  return "muted";
}

export function workTypeLabel(value: string): string {
  if (value === "REQ") return "需求";
  if (value === "BUG") return "缺陷";
  if (value === "TASK") return "任务";
  return value;
}

export function statusCategoryLabel(value: string): string {
  switch (value) {
    case "NEW":
      return "待处理";
    case "IN_PROGRESS":
      return "进行中";
    case "PENDING_DECISION":
      return "待决策";
    case "DONE":
      return "已完成";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

export function priorityLabel(value: unknown): string {
  const priority = asNumber(value);
  if (priority === 1) return "紧急";
  if (priority === 2) return "高";
  if (priority === 3) return "中";
  if (priority === 4) return "低";
  return value === null || value === undefined ? "" : String(value);
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "待处理",
  ONLINE: "在线",
  OFFLINE: "离线",
  BUSY: "忙碌",
  DRAFT: "草稿",
  RUNNING: "运行中",
  SUCCEEDED: "成功",
  FAILED: "失败",
  CANCELED: "已取消",
  CANCELLED: "已取消",
  PENDING: "待处理",
  PENDING_REVIEW: "待审核",
  PENDING_DECISION: "待决策",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
  ENABLED: "已启用",
  DISABLED: "已停用",
  ACTIVE: "运行中",
  PAUSED: "已暂停",
  EXHAUSTED: "已耗尽",
  ARCHIVED: "已归档",
  ADMIN: "管理员",
  READ_WRITE: "读写",
  READ_ONLY: "只读",
  REQ: "需求",
  BUG: "缺陷",
  TASK: "任务",
  SKILL: "技能",
  MCP: "MCP 服务",
  PLUGIN: "插件",
  RUNTIME_HOOK: "Runtime Hook",
  ORG: "组织",
  SQUAD: "小队",
  AGENT: "数字员工",
  HUMAN: "真人",
  STANDARD: "标准",
  PLATFORM: "平台",
  UNSCANNED: "未扫描",
  SCANNED: "已扫描",
  SCANNING: "扫描中",
  ISOLATED: "隔离会话",
  CONTINUOUS: "连续会话",
  SKIP: "跳过",
  QUEUE: "排队",
  ALLOW: "允许",
  FIRE_LATEST: "补最近一次",
  FIRE_ALL: "全部补跑",
  SKIP_ALL: "全部跳过",
  CRON: "Cron",
  ONCE: "单次",
};

export function displayStatus(value: string): string {
  return STATUS_LABELS[value.toUpperCase()] ?? value;
}

export const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  workType: "类型",
  statusName: "状态",
  statusCategory: "阶段",
  executionStatus: "执行状态",
  assigneeDisplayName: "当前处理人",
  assigneeLabel: "当前处理人",
  sdlcName: "SDLC",
  creatorDisplayName: "创建者",
  priority: "优先级",
  health: "健康度",
  gmtCreate: "创建时间",
  gmtModified: "更新时间",
  deletableReason: "删除限制",
  name: "名称",
  status: "状态",
  kind: "类型",
  roleName: "角色",
  roleCode: "角色编码",
  latestVersionNo: "最新版本",
  onlineVersionId: "在线版本",
  editingVersionId: "编辑版本",
  executorOnlineCount: "执行器在线",
  executorTotalCount: "执行器总数",
  skillCount: "能力数",
  memoryCount: "记忆数",
  repoPermCount: "仓库数",
  version: "版本",
  description: "描述",
  isDefault: "默认",
  stepCount: "步骤数",
  entryStepId: "入口步骤",
  ownerId: "所有者 ID",
  memberCount: "成员数",
  roleCount: "角色数",
  sdlcCount: "SDLC 数",
  url: "仓库地址",
  defaultBranch: "默认分支",
  scanStatus: "扫描状态",
  sourceType: "来源类型",
  categoryPath: "分类路径",
  packageFileName: "包文件",
  packageSize: "包大小",
  modifierName: "修改人",
  cronExpression: "Cron",
  runAt: "运行时间",
  timezone: "时区",
  nextFireAt: "下次运行",
  lastFireAt: "上次运行",
  sessionMode: "会话模式",
  overlapPolicy: "重叠策略",
  misfirePolicy: "错过策略",
  squadId: "小队 ID",
  initialAgentId: "初始数字员工",
  agentId: "数字员工 ID",
  agentName: "数字员工",
  agentLabel: "数字员工",
  clientKind: "客户端",
  lastConnectIp: "最近连接 IP",
  lastConnectHostname: "最近主机",
  lastHeartbeat: "最近心跳",
  lastStartedAt: "最近启动",
  squadNames: "小队",
  squadLabel: "小队",
  initialAgentLabel: "初始数字员工",
  ownerRef: "所有者",
  ownerName: "所有者",
  scope: "范围",
  type: "类型",
  path: "路径",
  parentId: "父分类",
  workspaceId: "工作区",
  title: "标题",
  contentMd: "正文 Markdown",
  assigneeType: "负责人类型",
  assigneeRef: "负责人 ID",
  sdlcId: "SDLC ID",
  scheduledStartAt: "计划开始时间",
  keyword: "关键字",
  page: "页码",
  size: "每页数量",
  offset: "偏移量",
  mineScope: "个人范围",
  pendingDecisionOnly: "仅看待决策",
  statusNodeId: "状态节点",
  categoryId: "分类 ID",
  skillId: "能力 ID",
  skillIds: "能力 ID 列表",
  repoIds: "仓库 ID 列表",
  fromRepoId: "源仓库 ID",
  toRepoId: "目标仓库 ID",
  relationType: "关系类型",
  expectedVersion: "期望版本",
  idempotencyKey: "幂等键",
  requestId: "请求 ID",
  runId: "运行 ID",
  dispatchId: "派发 ID",
  workitemId: "工单 ID",
  agentIds: "数字员工 ID 列表",
  instructionMd: "执行指令 Markdown",
};

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function withAssigneeLabel(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const name = asString(item.assigneeName);
  const ref = asNumber(item.assigneeRef);
  const assigneeLabel = name
    ? `${name}${ref !== undefined ? ` #${ref}` : ""}`
    : asString(item.assigneeDisplayName) || "未指派";
  return { ...item, assigneeLabel };
}
