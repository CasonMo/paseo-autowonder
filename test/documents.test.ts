import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadWorkitemDocument,
  uploadWorkitemDocuments,
} from "../server/documents";

test("document operations require explicit CLI consent", async () => {
  const upload = await uploadWorkitemDocuments(
    "https://example.test/mcp",
    1,
    2,
    ["/tmp/example.md"],
    false,
  );
  assert.equal(upload.ok, false);
  assert.equal(upload.needsConsent, true);

  const download = await downloadWorkitemDocument(
    "https://example.test/mcp",
    1,
    2,
    undefined,
    false,
  );
  assert.equal(download.ok, false);
  assert.equal(download.needsConsent, true);
});

test("download rejects path traversal before contacting MCP", async () => {
  const download = await downloadWorkitemDocument(
    "https://example.test/mcp",
    1,
    2,
    "../secret.md",
    true,
  );
  assert.equal(download.ok, false);
  assert.match(download.error ?? "", /文档名称不合法/);
});
