import type { ToolDescriptor } from "../shared/contracts";

const CLIENT_NAME = "paseo-autowonder-workbench";
const CLIENT_VERSION = "1.0.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 60_000;

interface SessionInfo {
  sessionId?: string;
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
}

interface HttpResult {
  json: unknown;
  sessionId?: string;
}

const sessions = new Map<string, SessionInfo>();
let requestId = 0;

function nextId(): number {
  requestId += 1;
  return requestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSsePayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  let dataLines: string[] = [];
  const flush = () => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    try {
      payloads.push(JSON.parse(payload));
    } catch {
      // Ignore keepalive or non-JSON SSE frames.
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
      continue;
    }
    if (line.trim() === "") flush();
  }
  flush();
  return payloads;
}

function pickResponse(payloads: unknown[], id: number): unknown {
  for (const payload of payloads) {
    if (isRecord(payload) && payload.id === id) return payload;
  }
  return payloads.find((payload) => isRecord(payload) && ("result" in payload || "error" in payload));
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `MCP 服务返回 HTTP ${status}，请检查 MCP URL 是否有效、是否已过期。`;
  }
  return `MCP 服务返回 HTTP ${status}。`;
}

async function post(url: string, body: unknown, session?: SessionInfo): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (session?.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
  if (session?.protocolVersion) headers["MCP-Protocol-Version"] = session.protocolVersion;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MCP 请求超时（60 秒）。");
    }
    throw new Error(`无法连接 MCP 服务：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  const sessionId = response.headers.get("mcp-session-id") ?? session?.sessionId;
  const text = await response.text();
  if (!response.ok) {
    const detail = text.trim().slice(0, 400);
    throw new Error(`${httpErrorMessage(response.status)}${detail ? ` ${detail}` : ""}`);
  }
  if (!text.trim()) return { json: null, sessionId };

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const payloads = parseSsePayloads(text);
    const id = isRecord(body) && typeof body.id === "number" ? body.id : undefined;
    return {
      json: id === undefined ? payloads[0] : pickResponse(payloads, id),
      sessionId,
    };
  }

  try {
    return { json: JSON.parse(text), sessionId };
  } catch {
    throw new Error(`MCP 服务返回了无法解析的响应：${text.slice(0, 200)}`);
  }
}

async function openSession(url: string): Promise<SessionInfo> {
  const cached = sessions.get(url);
  if (cached) return cached;

  const id = nextId();
  const { json, sessionId } = await post(url, {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    },
  });
  if (!isRecord(json)) throw new Error("MCP 初始化失败：响应为空。");
  if (isRecord(json.error)) {
    throw new Error(`MCP 初始化失败：${String(json.error.message ?? "未知错误")}`);
  }
  const result = isRecord(json.result) ? json.result : {};
  const serverInfo = isRecord(result.serverInfo) ? result.serverInfo : {};
  const session: SessionInfo = {
    sessionId,
    protocolVersion:
      typeof result.protocolVersion === "string"
        ? result.protocolVersion
        : DEFAULT_PROTOCOL_VERSION,
    serverName: typeof serverInfo.name === "string" ? serverInfo.name : undefined,
    serverVersion: typeof serverInfo.version === "string" ? serverInfo.version : undefined,
  };
  sessions.set(url, session);

  try {
    await post(url, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
  } catch {
    // Some stateless MCP servers reject the notification; the request below still decides.
  }
  return session;
}

async function request(
  url: string,
  method: string,
  params: Record<string, unknown>,
): Promise<{ result: unknown; session: SessionInfo }> {
  const call = async (session: SessionInfo) => {
    const { json, sessionId } = await post(
      url,
      { jsonrpc: "2.0", id: nextId(), method, params },
      session,
    );
    if (!isRecord(json)) throw new Error(`MCP ${method} 响应为空。`);
    if (isRecord(json.error)) {
      const code = json.error.code;
      const message = json.error.message;
      throw new Error(
        `MCP 错误${code === undefined ? "" : ` ${String(code)}`}：${String(message ?? "未知错误")}`,
      );
    }
    const nextSession: SessionInfo = sessionId ? { ...session, sessionId } : session;
    sessions.set(url, nextSession);
    return { result: json.result, session: nextSession };
  };

  try {
    return await call(await openSession(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/HTTP (400|404)/.test(message)) throw error;
    sessions.delete(url);
    return call(await openSession(url));
  }
}

function parseToolContent(result: unknown): {
  data: unknown;
  isError: boolean;
  contentText?: string;
} {
  if (!isRecord(result)) {
    return { data: result ?? null, isError: false };
  }
  const contentText = Array.isArray(result.content)
    ? result.content
        .filter((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
        .map((item) => String((item as Record<string, unknown>).text))
        .join("\n")
    : undefined;

  if (result.structuredContent !== undefined) {
    return {
      data: result.structuredContent,
      isError: result.isError === true,
      contentText,
    };
  }
  if (contentText) {
    try {
      return { data: JSON.parse(contentText), isError: result.isError === true, contentText };
    } catch {
      return { data: contentText, isError: result.isError === true, contentText };
    }
  }
  return {
    data: result.content ?? result,
    isError: result.isError === true,
  };
}

function normalizeTool(value: unknown): ToolDescriptor | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    inputSchema: isRecord(value.inputSchema) ? value.inputSchema : {},
    outputSchema: isRecord(value.outputSchema) ? value.outputSchema : undefined,
  };
}

export async function listTools(url: string): Promise<{
  tools: ToolDescriptor[];
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
}> {
  const { result, session } = await request(url, "tools/list", {});
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    throw new Error("MCP tools/list 返回结构异常。");
  }
  return {
    tools: result.tools.map(normalizeTool).filter((tool): tool is ToolDescriptor => tool !== null),
    serverName: session.serverName,
    serverVersion: session.serverVersion,
    protocolVersion: session.protocolVersion,
  };
}

export async function callTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; isError: boolean; contentText?: string }> {
  const { result } = await request(url, "tools/call", { name, arguments: args });
  return parseToolContent(result);
}
