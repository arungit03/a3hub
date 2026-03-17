import assert from "node:assert/strict";
import test from "node:test";
import { installChunkLoadRecovery } from "../src/lib/chunkLoadRecovery.js";

const originalWindow = globalThis.window;

const createMockWindow = () => {
  const listeners = new Map();
  const storage = new Map();
  const scheduled = [];
  let reloadCount = 0;

  return {
    window: {
      location: {
        pathname: "/ai-chat",
        search: "?mode=test",
        hash: "#latest",
        reload() {
          reloadCount += 1;
        },
      },
      sessionStorage: {
        getItem(key) {
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
          storage.set(key, String(value));
        },
        removeItem(key) {
          storage.delete(key);
        },
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      setTimeout(callback, delay) {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
    },
    emit(type, event) {
      const listener = listeners.get(type);
      if (listener) {
        listener(event);
      }
    },
    getReloadCount() {
      return reloadCount;
    },
    getMarker() {
      return storage.get("a3hub:chunk-reload-once") || "";
    },
    runCleanupTimer() {
      assert.equal(scheduled.length > 0, true);
      scheduled[0].callback();
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

test("installChunkLoadRecovery reloads once for a chunk load error", () => {
  const browser = createMockWindow();
  globalThis.window = browser.window;

  try {
    installChunkLoadRecovery();

    browser.emit("error", {
      message: "Failed to fetch dynamically imported module: /assets/AppShell.js",
    });
    browser.emit("error", {
      message: "Failed to fetch dynamically imported module: /assets/AppShell.js",
    });

    assert.equal(browser.getReloadCount(), 1);
    assert.equal(browser.getMarker(), "/ai-chat?mode=test#latest");
  } finally {
    restoreWindow();
  }
});

test("installChunkLoadRecovery ignores unrelated promise rejections and clears the marker later", () => {
  const browser = createMockWindow();
  globalThis.window = browser.window;
  let prevented = false;

  try {
    installChunkLoadRecovery();

    browser.emit("unhandledrejection", {
      reason: new Error("some other error"),
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(browser.getReloadCount(), 0);
    assert.equal(prevented, false);

    browser.emit("unhandledrejection", {
      reason: new Error("ChunkLoadError: Loading chunk 7 failed"),
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(browser.getReloadCount(), 1);
    assert.equal(prevented, true);

    browser.runCleanupTimer();
    assert.equal(browser.getMarker(), "");
  } finally {
    restoreWindow();
  }
});
