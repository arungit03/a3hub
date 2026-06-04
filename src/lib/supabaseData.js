// @ts-nocheck
import { supabase, supabaseConfig, supabaseClientReady } from "./supabase.js";

const TRANSFORM_KEY = "__a3hubTransform";
const VALUE_TYPE_KEY = "__a3hubType";
const TIMESTAMP_TYPE = "timestamp";
const DEFAULT_FETCH_LIMIT = 10000;
const snapshotListeners = new Set();

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const normalizePathSegments = (segments = []) =>
  segments
    .flatMap((segment) => String(segment || "").split("/"))
    .map((segment) => segment.trim())
    .filter(Boolean);

const joinPath = (...segments) => normalizePathSegments(segments).join("/");

const getParentCollectionPath = (path) => {
  const segments = normalizePathSegments([path]);
  if (segments.length <= 1) return "";
  return segments.slice(0, -1).join("/");
};

const getDocumentId = (path) => {
  const segments = normalizePathSegments([path]);
  return segments[segments.length - 1] || "";
};

const shouldRefreshSnapshotListener = (listener, changedRef) => {
  if (!listener || !changedRef?.path) return false;
  if (listener.type === "doc") return listener.path === changedRef.path;
  return listener.path === getParentCollectionPath(changedRef.path);
};

const notifyLocalSnapshotListeners = (changedRef) => {
  snapshotListeners.forEach((listener) => {
    if (shouldRefreshSnapshotListener(listener, changedRef)) {
      listener.scheduleLoad();
    }
  });
};

const cloneJson = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

export class SupabaseTimestamp {
  constructor(date = new Date()) {
    const safeDate = date instanceof Date ? date : new Date(date);
    const millis = Number.isFinite(safeDate.getTime()) ? safeDate.getTime() : Date.now();
    this.seconds = Math.floor(millis / 1000);
    this.nanoseconds = (millis % 1000) * 1000000;
    this.iso = new Date(millis).toISOString();
  }

  toDate() {
    return new Date(this.iso);
  }

  toMillis() {
    return this.toDate().getTime();
  }

  toJSON() {
    return {
      [VALUE_TYPE_KEY]: TIMESTAMP_TYPE,
      iso: this.iso,
      seconds: this.seconds,
      nanoseconds: this.nanoseconds,
    };
  }

  valueOf() {
    return this.toMillis();
  }

  static now() {
    return new SupabaseTimestamp(new Date());
  }

  static fromDate(date) {
    return new SupabaseTimestamp(date);
  }

  static fromMillis(milliseconds) {
    return new SupabaseTimestamp(new Date(milliseconds));
  }
}

export const Timestamp = SupabaseTimestamp;

export const serverTimestamp = () => ({
  [TRANSFORM_KEY]: "serverTimestamp",
});

export const arrayUnion = (...values) => ({
  [TRANSFORM_KEY]: "arrayUnion",
  values,
});

export const arrayRemove = (...values) => ({
  [TRANSFORM_KEY]: "arrayRemove",
  values,
});

export const increment = (amount = 1) => ({
  [TRANSFORM_KEY]: "increment",
  amount: Number(amount) || 0,
});

const isTransform = (value, name = "") =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  value[TRANSFORM_KEY] &&
  (!name || value[TRANSFORM_KEY] === name);

const serializeValue = (value) => {
  if (isTransform(value)) return value;
  if (value instanceof SupabaseTimestamp) return value.toJSON();
  if (value instanceof Date) return SupabaseTimestamp.fromDate(value).toJSON();
  if (Array.isArray(value)) return value.map((item) => serializeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, serializeValue(item)]]
      )
    );
  }
  return value === undefined ? null : value;
};

const hydrateValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => hydrateValue(item));
  if (value && typeof value === "object") {
    if (value[VALUE_TYPE_KEY] === TIMESTAMP_TYPE) {
      if (value.iso) return SupabaseTimestamp.fromDate(new Date(value.iso));
      if (Number.isFinite(value.seconds)) {
        return SupabaseTimestamp.fromMillis(Number(value.seconds) * 1000);
      }
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, hydrateValue(item)])
    );
  }
  return value;
};

const getComparableValue = (value) => {
  const hydrated = hydrateValue(value);
  if (hydrated instanceof SupabaseTimestamp) return hydrated.toMillis();
  if (hydrated instanceof Date) return hydrated.getTime();
  return hydrated;
};

const getFieldValue = (data, fieldPath) => {
  const parts = String(fieldPath || "").split(".").filter(Boolean);
  let current = data;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
};

const setFieldValue = (target, fieldPath, value) => {
  const parts = String(fieldPath || "").split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  });
  current[parts[parts.length - 1]] = value;
};

const deleteFieldValue = (target, fieldPath) => {
  const parts = String(fieldPath || "").split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    if (!current || typeof current !== "object") return;
    current = current[part];
  });
  if (current && typeof current === "object") {
    delete current[parts[parts.length - 1]];
  }
};

const deepMerge = (base, patch) => {
  const output =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
};

const valuesEqual = (left, right) =>
  JSON.stringify(serializeValue(left)) === JSON.stringify(serializeValue(right));

const applyTransforms = (input, existing = {}, { dottedFields = false } = {}) => {
  const output = {};
  Object.entries(input || {}).forEach(([key, rawValue]) => {
    if (rawValue === undefined) return;
    const previousValue = dottedFields ? getFieldValue(existing, key) : existing?.[key];
    let nextValue;

    if (isTransform(rawValue, "serverTimestamp")) {
      nextValue = SupabaseTimestamp.now().toJSON();
    } else if (isTransform(rawValue, "arrayUnion")) {
      const currentArray = Array.isArray(previousValue) ? previousValue : [];
      nextValue = currentArray.slice();
      rawValue.values.forEach((item) => {
        const serializedItem = serializeValue(item);
        if (!nextValue.some((existingItem) => valuesEqual(existingItem, serializedItem))) {
          nextValue.push(serializedItem);
        }
      });
    } else if (isTransform(rawValue, "arrayRemove")) {
      const currentArray = Array.isArray(previousValue) ? previousValue : [];
      nextValue = currentArray.filter(
        (item) => !rawValue.values.some((removeItem) => valuesEqual(item, removeItem))
      );
    } else if (isTransform(rawValue, "increment")) {
      const currentNumber = Number(previousValue || 0);
      nextValue = (Number.isFinite(currentNumber) ? currentNumber : 0) + rawValue.amount;
    } else {
      nextValue = serializeValue(rawValue);
    }

    if (dottedFields && key.includes(".")) {
      setFieldValue(output, key, nextValue);
    } else {
      output[key] = nextValue;
    }
  });
  return output;
};

const assertClient = () => {
  if (!supabase) {
    const error = new Error("Supabase is not configured.");
    error.code = "supabase/not-configured";
    throw error;
  }
  return supabase;
};

export const collection = (base, ...segments) => {
  const basePath = base?.type === "doc" || base?.type === "collection" ? base.path : "";
  const path = joinPath(basePath, ...segments);
  return {
    type: "collection",
    path,
    id: getDocumentId(path),
  };
};

export const doc = (base, ...segments) => {
  if (base?.type === "collection") {
    const id = segments.length > 0 ? segments[0] : randomId();
    const rest = segments.slice(1);
    const path = joinPath(base.path, id, ...rest);
    return {
      type: "doc",
      path,
      id: getDocumentId(path),
      parent: collection(null, getParentCollectionPath(path)),
    };
  }

  const path = joinPath(...segments);
  return {
    type: "doc",
    path,
    id: getDocumentId(path),
    parent: collection(null, getParentCollectionPath(path)),
  };
};

export const where = (field, op, value) => ({
  type: "where",
  field,
  op,
  value,
});

export const orderBy = (field, direction = "asc") => ({
  type: "orderBy",
  field,
  direction: String(direction || "asc").toLowerCase() === "desc" ? "desc" : "asc",
});

export const limit = (count) => ({
  type: "limit",
  count: Math.max(0, Number(count) || 0),
});

export const query = (base, ...constraints) => ({
  type: "query",
  source: base,
  path: base?.path || "",
  constraints: constraints.filter(Boolean),
});

class SupabaseDocumentSnapshot {
  constructor(ref, data, exists = false) {
    this.ref = ref;
    this.id = ref.id;
    this.metadata = { fromCache: false, hasPendingWrites: false };
    this._data = data || null;
    this._exists = Boolean(exists);
  }

  exists() {
    return this._exists;
  }

  data() {
    return this._exists ? hydrateValue(cloneJson(this._data || {})) : undefined;
  }
}

class SupabaseQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

const mapRowToDocumentSnapshot = (row) =>
  new SupabaseDocumentSnapshot(
    doc(null, row.path),
    row.data && typeof row.data === "object" ? row.data : {},
    true
  );

const fetchDocumentRow = async (ref) => {
  const client = assertClient();
  const { data, error } = await client
    .from(supabaseConfig.documentsTable)
    .select("path, collection_path, document_id, data")
    .eq("path", ref.path)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const getDoc = async (ref) => {
  const row = await fetchDocumentRow(ref);
  return row
    ? mapRowToDocumentSnapshot(row)
    : new SupabaseDocumentSnapshot(ref, null, false);
};

const getQueryParts = (refOrQuery) => {
  const source = refOrQuery?.type === "query" ? refOrQuery.source : refOrQuery;
  const constraints = refOrQuery?.type === "query" ? refOrQuery.constraints || [] : [];
  return {
    source,
    constraints,
    path: source?.path || refOrQuery?.path || "",
  };
};

const compareByConstraint = (data, constraint) => {
  const current = getComparableValue(getFieldValue(data, constraint.field));
  const expected = getComparableValue(constraint.value);

  switch (constraint.op) {
    case "==":
      return valuesEqual(current, expected);
    case "!=":
      return !valuesEqual(current, expected);
    case ">":
      return current > expected;
    case ">=":
      return current >= expected;
    case "<":
      return current < expected;
    case "<=":
      return current <= expected;
    case "in":
      return Array.isArray(expected) && expected.some((item) => valuesEqual(current, item));
    case "array-contains":
      return Array.isArray(current) && current.some((item) => valuesEqual(item, expected));
    default:
      return true;
  }
};

const applyQueryConstraints = (rows, constraints) => {
  let nextRows = rows.slice();
  constraints
    .filter((constraint) => constraint.type === "where")
    .forEach((constraint) => {
      nextRows = nextRows.filter((row) =>
        compareByConstraint(hydrateValue(row.data || {}), constraint)
      );
    });

  const orderConstraints = constraints.filter((constraint) => constraint.type === "orderBy");
  orderConstraints.forEach((constraint) => {
    nextRows.sort((left, right) => {
      const leftValue = getComparableValue(getFieldValue(left.data || {}, constraint.field));
      const rightValue = getComparableValue(getFieldValue(right.data || {}, constraint.field));
      if (leftValue === rightValue) return 0;
      if (leftValue === undefined || leftValue === null) return 1;
      if (rightValue === undefined || rightValue === null) return -1;
      const result = leftValue > rightValue ? 1 : -1;
      return constraint.direction === "desc" ? -result : result;
    });
  });

  const limitConstraint = constraints.find((constraint) => constraint.type === "limit");
  if (limitConstraint) {
    nextRows = nextRows.slice(0, limitConstraint.count);
  }

  return nextRows;
};

export const getDocs = async (refOrQuery) => {
  const client = assertClient();
  const { constraints, path } = getQueryParts(refOrQuery);
  const hardLimit =
    constraints.find((constraint) => constraint.type === "limit")?.count ||
    DEFAULT_FETCH_LIMIT;
  const { data, error } = await client
    .from(supabaseConfig.documentsTable)
    .select("path, collection_path, document_id, data")
    .eq("collection_path", path)
    .limit(Math.max(hardLimit, DEFAULT_FETCH_LIMIT));
  if (error) throw error;

  const rows = applyQueryConstraints(Array.isArray(data) ? data : [], constraints);
  return new SupabaseQuerySnapshot(rows.map((row) => mapRowToDocumentSnapshot(row)));
};

const writeDocumentData = async (ref, data) => {
  const client = assertClient();
  const payload = {
    path: ref.path,
    collection_path: getParentCollectionPath(ref.path),
    document_id: ref.id,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client
    .from(supabaseConfig.documentsTable)
    .upsert(payload, { onConflict: "path" });
  if (error) throw error;
  notifyLocalSnapshotListeners(ref);
};

export const setDoc = async (ref, input, options = {}) => {
  const existingRow = options?.merge ? await fetchDocumentRow(ref) : null;
  const existingData =
    existingRow?.data && typeof existingRow.data === "object" ? existingRow.data : {};
  const patch = applyTransforms(input, existingData);
  const nextData = options?.merge ? deepMerge(existingData, patch) : patch;
  await writeDocumentData(ref, nextData);
};

export const addDoc = async (collectionRef, input) => {
  const reference = doc(collectionRef);
  await setDoc(reference, input);
  return reference;
};

export const updateDoc = async (ref, input) => {
  const existingRow = await fetchDocumentRow(ref);
  if (!existingRow) {
    const error = new Error("Document does not exist.");
    error.code = "supabase/not-found";
    throw error;
  }
  const existingData =
    existingRow.data && typeof existingRow.data === "object" ? existingRow.data : {};
  const patch = applyTransforms(input, existingData, { dottedFields: true });
  const nextData = deepMerge(existingData, patch);
  Object.entries(input || {}).forEach(([key, value]) => {
    if (value === undefined) {
      deleteFieldValue(nextData, key);
    }
  });
  await writeDocumentData(ref, nextData);
};

export const deleteDoc = async (ref) => {
  const client = assertClient();
  const { error } = await client
    .from(supabaseConfig.documentsTable)
    .delete()
    .eq("path", ref.path);
  if (error) throw error;
  notifyLocalSnapshotListeners(ref);
};

export const writeBatch = () => {
  const operations = [];
  return {
    set: (ref, data, options = {}) => operations.push(() => setDoc(ref, data, options)),
    update: (ref, data) => operations.push(() => updateDoc(ref, data)),
    delete: (ref) => operations.push(() => deleteDoc(ref)),
    commit: async () => {
      for (const operation of operations) {
        await operation();
      }
    },
  };
};

export const runTransaction = async (_db, updateFunction) => {
  const operations = [];
  const transaction = {
    get: (ref) => getDoc(ref),
    set: (ref, data, options = {}) => {
      operations.push(() => setDoc(ref, data, options));
      return transaction;
    },
    update: (ref, data) => {
      operations.push(() => updateDoc(ref, data));
      return transaction;
    },
    delete: (ref) => {
      operations.push(() => deleteDoc(ref));
      return transaction;
    },
  };
  const result = await updateFunction(transaction);
  for (const operation of operations) {
    await operation();
  }
  return result;
};

export const getCountFromServer = async (refOrQuery) => {
  const snapshot = await getDocs(refOrQuery);
  return {
    data: () => ({
      count: snapshot.size,
    }),
  };
};

export const onSnapshot = (refOrQuery, onNext, onError) => {
  let active = true;
  let debounceTimer = 0;
  let loadRequestId = 0;
  const { path } = getQueryParts(refOrQuery);
  const load = async () => {
    const requestId = ++loadRequestId;
    try {
      const snapshot =
        refOrQuery?.type === "doc" ? await getDoc(refOrQuery) : await getDocs(refOrQuery);
      if (active && requestId === loadRequestId) onNext(snapshot);
    } catch (error) {
      if (active && requestId === loadRequestId) onError?.(error);
    }
  };
  const listener = {
    type: refOrQuery?.type === "doc" ? "doc" : "collection",
    path: refOrQuery?.type === "doc" ? refOrQuery.path : path,
    scheduleLoad: (delay = 0) => {
      if (!active) return;
      clearTimeout(debounceTimer);
      debounceTimer = globalThis.setTimeout(load, delay);
    },
  };
  snapshotListeners.add(listener);

  void load();

  if (!supabaseClientReady || !supabase) {
    return () => {
      active = false;
      snapshotListeners.delete(listener);
      clearTimeout(debounceTimer);
    };
  }

  const filter =
    refOrQuery?.type === "doc" ? `path=eq.${refOrQuery.path}` : `collection_path=eq.${path}`;
  const channel = supabase
    .channel(`a3hub-docs-${randomId()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: supabaseConfig.documentsTable,
        filter,
      },
      () => {
        listener.scheduleLoad(120);
      }
    )
    .subscribe();

  return () => {
    active = false;
    snapshotListeners.delete(listener);
    clearTimeout(debounceTimer);
    void supabase.removeChannel(channel);
  };
};

export const enableIndexedDbPersistence = () => Promise.resolve();
