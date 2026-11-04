import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  downloadWorkitemDocument,
  previewWorkitemDocument,
  readPreviewText,
} from "../server/documents";

test("document operations require explicit CLI consent", async () => {
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

test("document preview requires explicit CLI consent", async () => {
  const preview = await previewWorkitemDocument(
    "https://example.test/mcp",
    1,
    2,
    "notes.md",
    false,
  );
  assert.equal(preview.ok, false);
  assert.equal(preview.needsConsent, true);
});

test("preview rejects path traversal before contacting MCP", async () => {
  const preview = await previewWorkitemDocument(
    "https://example.test/mcp",
    1,
    2,
    "../secret.md",
    true,
  );
  assert.equal(preview.ok, false);
  assert.match(preview.error ?? "", /文档名称不合法/);
});

test("reads text previews and rejects binary content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-preview-"));
  try {
    const markdown = path.join(dir, "notes.md");
    fs.writeFileSync(markdown, "# Hello\n\nPreview body\n", "utf8");
    const text = readPreviewText(dir, {
      name: "notes.md",
      path: markdown,
      size: 23,
    });
    assert.equal(text.ok, true);
    assert.equal(text.content, "# Hello\n\nPreview body\n");

    const binary = path.join(dir, "image.png");
    fs.writeFileSync(binary, Buffer.from([0, 1, 2, 3]));
    const rejected = readPreviewText(dir, {
      name: "image.png",
      path: binary,
      size: 4,
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.error ?? "", /不是可预览/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
