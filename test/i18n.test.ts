import assert from "node:assert/strict";
import test from "node:test";
import { translateText } from "../client/i18n";

test("translates static UI labels", () => {
  assert.equal(translateText("en", "工单"), "Workitems");
  assert.equal(translateText("zh-CN", "工单"), "工单");
});

test("translates interpolated UI labels", () => {
  assert.equal(
    translateText("en", "已加载 {{count}} 条", { count: 3 }),
    "3 loaded",
  );
});

test("translates web URL settings and workitem links", () => {
  assert.equal(
    translateText("en", "AutoWonder 网页地址（可选）"),
    "AutoWonder web URL (optional)",
  );
  assert.equal(translateText("en", "打开失败"), "Could not open");
});

test("translates dynamic labels and settings errors", () => {
  assert.equal(
    translateText("en", "工作台 · {{server}} · {{count}} 个工具 · {{host}}", {
      server: "AutoWonder",
      count: 12,
      host: "example.com",
    }),
    "Workbench · AutoWonder · 12 tools · example.com",
  );
  assert.equal(
    translateText("en", "配置读取失败：{{error}}", {
      error: "invalid",
    }),
    "Failed to load settings: invalid",
  );
  assert.equal(
    translateText("en", "文档 #{{id}}", { id: 7 }),
    "Document #7",
  );
});
