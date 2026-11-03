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
