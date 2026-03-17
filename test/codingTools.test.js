import assert from "node:assert/strict";
import test from "node:test";
import {
  applyIndentToText,
  applyOutdentToText,
  applyToggleLineComment,
  readDraftValue,
  saveDraftValue,
} from "../src/lib/codingTools.js";

const originalWindow = globalThis.window;

const createStorageWindow = () => {
  const store = new Map();
  return {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
    },
  };
};

const restoreWindow = () => {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
};

test("readDraftValue and saveDraftValue round-trip local editor content", () => {
  globalThis.window = createStorageWindow();

  try {
    assert.equal(readDraftValue("editor:demo", "fallback"), "fallback");

    saveDraftValue("editor:demo", "print('hello')");
    assert.equal(readDraftValue("editor:demo", ""), "print('hello')");
  } finally {
    restoreWindow();
  }
});

test("applyIndentToText indents all selected lines", () => {
  const result = applyIndentToText({
    value: "first\nsecond",
    selectionStart: 1,
    selectionEnd: 10,
    indentUnit: "  ",
  });

  assert.deepEqual(result, {
    value: "  first\n  second",
    selectionStart: 3,
    selectionEnd: 14,
  });
});

test("applyOutdentToText removes indentation across a selected block", () => {
  const result = applyOutdentToText({
    value: "    first\n  second",
    selectionStart: 0,
    selectionEnd: 17,
    indentUnit: "  ",
  });

  assert.deepEqual(result, {
    value: "  first\nsecond",
    selectionStart: 0,
    selectionEnd: 13,
  });
});

test("applyToggleLineComment comments and uncomments the current line", () => {
  const commented = applyToggleLineComment({
    value: "const total = 1;",
    selectionStart: 6,
    selectionEnd: 6,
    commentToken: "//",
  });

  assert.deepEqual(commented, {
    value: "// const total = 1;",
    selectionStart: 9,
    selectionEnd: 9,
  });

  const uncommented = applyToggleLineComment({
    value: commented.value,
    selectionStart: commented.selectionStart,
    selectionEnd: commented.selectionEnd,
    commentToken: "//",
  });

  assert.deepEqual(uncommented, {
    value: "const total = 1;",
    selectionStart: 6,
    selectionEnd: 6,
  });
});
