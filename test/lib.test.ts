import assert from "node:assert/strict";
import test from "node:test";
import { workitemWebUrl } from "../client/lib";

test("builds an AutoWonder workitem URL from the MCP endpoint", () => {
  assert.equal(
    workitemWebUrl("https://example.com/app/sdlc/api/mcp/token/", 42),
    "https://example.com/app/sdlc/workitems/42",
  );
});

test("supports an MCP endpoint at the origin root and rejects invalid URLs", () => {
  assert.equal(
    workitemWebUrl("https://example.com/api/mcp/token", 7),
    "https://example.com/workitems/7",
  );
  assert.equal(
    workitemWebUrl("https://example.com/api/mcp", 7),
    "https://example.com/workitems/7",
  );
  assert.equal(workitemWebUrl("not a URL", 1), null);
  assert.equal(workitemWebUrl("ftp://example.com/api/mcp/token", 1), null);
});

test("uses a configured web base URL for standalone deployments", () => {
  assert.equal(
    workitemWebUrl(
      "https://example.com/api/mcp/token",
      100,
      "http://localhost:7001",
    ),
    "http://localhost:7001/workitems/100",
  );
  assert.equal(
    workitemWebUrl(
      "https://example.com/api/mcp/token",
      100,
      "http://localhost:7001/",
    ),
    "http://localhost:7001/workitems/100",
  );
  assert.equal(
    workitemWebUrl(
      "https://example.com/api/mcp/token",
      100,
      "https://example.com/sdlc/workitems",
    ),
    "https://example.com/sdlc/workitems/100",
  );
  assert.equal(
    workitemWebUrl(
      "https://example.com/api/mcp/token",
      100,
      "https://example.com/sdlc/workitems/100",
    ),
    "https://example.com/sdlc/workitems/100",
  );
});
