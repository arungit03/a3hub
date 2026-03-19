const DEFAULT_MAX_CONCURRENT = 25;
const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_MAX_QUEUE_WAIT_MS = 15000;

const stateByFunction = new Map();

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(fallback);
  }
  return Math.floor(parsed);
};

const toNonNegativeInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number(fallback);
  }
  return Math.floor(parsed);
};

const getOrCreateState = (functionName) => {
  const key = toSafeText(functionName) || "function";
  const existing = stateByFunction.get(key);
  if (existing) return { key, state: existing };

  const created = {
    active: 0,
    queue: [],
  };
  stateByFunction.set(key, created);
  return { key, state: created };
};

const removeQueuedEntry = (state, entry) => {
  const index = state.queue.indexOf(entry);
  if (index >= 0) {
    state.queue.splice(index, 1);
  }
};

const buildOverloadedError = ({
  reason = "queue_full",
  functionName = "function",
  active = 0,
  queued = 0,
  retryAfterSeconds = 1,
}) => {
  const error = new Error("Function is overloaded. Retry later.");
  error.code = "capacity/overloaded";
  error.reason = reason;
  error.functionName = functionName;
  error.active = Math.max(0, Number(active) || 0);
  error.queued = Math.max(0, Number(queued) || 0);
  error.retryAfterSeconds = Math.max(1, Number(retryAfterSeconds) || 1);
  return error;
};

const cleanupStateIfIdle = (functionName, state) => {
  if (state.active > 0) return;
  if (state.queue.length > 0) return;
  stateByFunction.delete(functionName);
};

const createRelease = ({
  functionName,
  state,
  maxConcurrent,
}) => {
  let released = false;
  return () => {
    if (released) return;
    released = true;

    state.active = Math.max(0, state.active - 1);

    if (state.active < maxConcurrent && state.queue.length > 0) {
      const next = state.queue.shift();
      if (next?.timer) {
        clearTimeout(next.timer);
      }
      if (next && !next.done) {
        next.done = true;
        state.active += 1;
        next.resolve(
          createRelease({
            functionName,
            state,
            maxConcurrent,
          })
        );
      }
    }

    cleanupStateIfIdle(functionName, state);
  };
};

const acquireCapacitySlot = async ({
  functionName,
  maxConcurrent,
  maxQueueSize,
  maxQueueWaitMs,
}) => {
  const { key, state } = getOrCreateState(functionName);

  if (state.active < maxConcurrent) {
    state.active += 1;
    return createRelease({
      functionName: key,
      state,
      maxConcurrent,
    });
  }

  if (maxQueueSize <= 0 || state.queue.length >= maxQueueSize) {
    throw buildOverloadedError({
      reason: "queue_full",
      functionName: key,
      active: state.active,
      queued: state.queue.length,
      retryAfterSeconds: Math.ceil(Math.max(1000, maxQueueWaitMs) / 1000),
    });
  }

  return new Promise((resolve, reject) => {
    const queuedEntry = {
      resolve,
      reject,
      timer: null,
      done: false,
    };

    if (maxQueueWaitMs > 0) {
      queuedEntry.timer = setTimeout(() => {
        if (queuedEntry.done) return;
        queuedEntry.done = true;
        removeQueuedEntry(state, queuedEntry);
        reject(
          buildOverloadedError({
            reason: "queue_timeout",
            functionName: key,
            active: state.active,
            queued: state.queue.length,
            retryAfterSeconds: Math.ceil(Math.max(1000, maxQueueWaitMs) / 1000),
          })
        );
        cleanupStateIfIdle(key, state);
      }, maxQueueWaitMs);
    }

    state.queue.push(queuedEntry);
  });
};

const runWithCapacityGuard = async (
  {
    functionName = "function",
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    maxQueueSize = DEFAULT_MAX_QUEUE,
    maxQueueWaitMs = DEFAULT_MAX_QUEUE_WAIT_MS,
    buildBusyResponse = null,
  } = {},
  task = async () => null
) => {
  const safeFunctionName = toSafeText(functionName) || "function";
  const safeMaxConcurrent = toPositiveInteger(
    maxConcurrent,
    DEFAULT_MAX_CONCURRENT
  );
  const safeMaxQueueSize = toNonNegativeInteger(maxQueueSize, DEFAULT_MAX_QUEUE);
  const safeMaxQueueWaitMs = toPositiveInteger(
    maxQueueWaitMs,
    DEFAULT_MAX_QUEUE_WAIT_MS
  );

  let release = null;
  try {
    release = await acquireCapacitySlot({
      functionName: safeFunctionName,
      maxConcurrent: safeMaxConcurrent,
      maxQueueSize: safeMaxQueueSize,
      maxQueueWaitMs: safeMaxQueueWaitMs,
    });
    return await task();
  } catch (error) {
    if (error?.code === "capacity/overloaded") {
      if (typeof buildBusyResponse === "function") {
        return buildBusyResponse(error);
      }

      return {
        statusCode: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": String(error.retryAfterSeconds || 1),
        },
        body: JSON.stringify({
          error: "Service is currently busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: error.reason || "queue_full",
          retryAfterSeconds: error.retryAfterSeconds || 1,
        }),
      };
    }
    throw error;
  } finally {
    if (typeof release === "function") {
      release();
    }
  }
};

module.exports = {
  runWithCapacityGuard,
  toPositiveInteger,
};
