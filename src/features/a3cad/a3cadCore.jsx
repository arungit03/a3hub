/* eslint-disable react-refresh/only-export-components */

import { Lightbulb, Power } from "lucide-react";

export const GRID = 24;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.2;
export const DRAG_MIME = "application/x-a3cad";
export const OUT = "out-0";
export const IN_PREFIX = "in-";
export const INITIAL_VIEWPORT = Object.freeze({ x: 170, y: 100, zoom: 1 });
const NODE_W = 148;
const NODE_H = 96;

export const TYPES = {
  switch: { label: "Input Switch", short: "SW", ins: 0, outs: 1, w: NODE_W, h: NODE_H, cls: "from-amber-500 to-orange-600", logic: "Q = 0 / 1", desc: "Binary source" },
  led: { label: "Output LED", short: "LED", ins: 1, outs: 0, w: NODE_W, h: NODE_H, cls: "from-emerald-500 to-green-700", logic: "LED = A", desc: "Visual output" },
  and: { label: "AND Gate", short: "AND", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = A & B", desc: "True only when both inputs are true" },
  or: { label: "OR Gate", short: "OR", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = A | B", desc: "True when any input is true" },
  not: { label: "NOT Gate", short: "NOT", ins: 1, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = !A", desc: "Inverter" },
  nand: { label: "NAND Gate", short: "NAND", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = !(A & B)", desc: "AND then invert" },
  nor: { label: "NOR Gate", short: "NOR", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = !(A | B)", desc: "OR then invert" },
  xor: { label: "XOR Gate", short: "XOR", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = A ^ B", desc: "True when inputs differ" },
  xnor: { label: "XNOR Gate", short: "XNOR", ins: 2, outs: 1, w: NODE_W, h: NODE_H, cls: "from-slate-700 to-slate-900", logic: "Q = !(A ^ B)", desc: "True when inputs match" },
};

export const LIB_ORDER = ["switch", "led", "and", "or", "not", "nand", "nor", "xor", "xnor"];
export const GUIDE_GATE_ORDER = ["or", "nor", "and", "nand", "xor", "xnor", "not"];
export const GUIDE_IO_ORDER = ["switch", "led"];

const COMPONENT_GLYPH = {
  switch: "SW",
  led: "OUT",
  and: "AND",
  or: "OR",
  not: "NOT",
  nand: "NAND",
  nor: "NOR",
  xor: "XOR",
  xnor: "XNOR",
};

const COMPONENT_GLYPH_CLASS = {
  switch: "from-amber-100 to-orange-200 text-amber-800 border-amber-300/80",
  led: "from-emerald-100 to-green-200 text-emerald-800 border-emerald-300/80",
  and: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  or: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  not: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  nand: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  nor: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  xor: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
  xnor: "from-slate-100 to-slate-200 text-slate-800 border-slate-300/80",
};

const TOOLBAR_BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0";

const TOOLBAR_BUTTON_VARIANTS = {
  run: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-300",
  stop: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-300",
  danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-300",
  accent: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:ring-indigo-300",
  neutral: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300",
};

const PANEL_BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0";

const PANEL_BUTTON_VARIANTS = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300",
  danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-300",
};

export const START_COMPONENTS = Object.freeze([
  { id: "cmp_1", type: "switch", x: 72, y: 96, rotation: 0, state: { value: 0 } },
  { id: "cmp_2", type: "switch", x: 72, y: 216, rotation: 0, state: { value: 0 } },
  { id: "cmp_3", type: "and", x: 288, y: 156, rotation: 0, state: {} },
  { id: "cmp_4", type: "led", x: 528, y: 156, rotation: 0, state: {} },
]);

export const START_WIRES = Object.freeze([
  { id: "wire_1", from: { componentId: "cmp_1", pinId: OUT }, to: { componentId: "cmp_3", pinId: "in-0" } },
  { id: "wire_2", from: { componentId: "cmp_2", pinId: OUT }, to: { componentId: "cmp_3", pinId: "in-1" } },
  { id: "wire_3", from: { componentId: "cmp_3", pinId: OUT }, to: { componentId: "cmp_4", pinId: "in-0" } },
]);

export const cloneComponents = () => START_COMPONENTS.map((c) => ({ ...c, state: { ...(c.state || {}) } }));
export const cloneWires = () => START_WIRES.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } }));
export const cloneCircuitState = (components, wires) => ({
  components: components.map((c) => ({ ...c, state: { ...(c.state || {}) } })),
  wires: wires.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } })),
});
export const bit = (v) => (Number(v) ? 1 : 0);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const snap = (v) => Math.round(v / GRID) * GRID;
export const sid = (v, fallback = "") => String(v ?? "").trim() || fallback;
export const inPin = (i) => `${IN_PREFIX}${i}`;
export const touchDistance = (touchA, touchB) =>
  Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
export const touchMidpoint = (touchA, touchB) => ({
  x: (touchA.clientX + touchB.clientX) / 2,
  y: (touchA.clientY + touchB.clientY) / 2,
});
export const pinIndex = (pin, prefix) => {
  if (typeof pin !== "string" || !pin.startsWith(prefix)) return -1;
  const n = Number(pin.slice(prefix.length));
  return Number.isInteger(n) && n >= 0 ? n : -1;
};
export const validInput = (type, pin) => {
  const d = TYPES[type];
  const idx = pinIndex(pin, IN_PREFIX);
  return Boolean(d && d.ins > 0 && idx >= 0 && idx < d.ins);
};
export const validOutput = (type, pin) => Boolean(TYPES[type]?.outs > 0 && pin === OUT);
export const nextCounter = (items, prefix) => {
  const rx = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const item of items) {
    const m = rx.exec(String(item?.id || ""));
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return Math.max(max + 1, items.length + 1);
};
export const toWorld = (x, y, viewport, rect) => ({
  x: (x - rect.left - viewport.x) / viewport.zoom,
  y: (y - rect.top - viewport.y) / viewport.zoom,
});
export const textTarget = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
};
export const pinPos = (component, pinId) => {
  const d = TYPES[component?.type];
  if (!d) return null;
  if (pinId === OUT && d.outs > 0) return { x: component.x + d.w, y: component.y + d.h / 2 };
  const i = pinIndex(pinId, IN_PREFIX);
  if (i < 0 || i >= d.ins) return null;
  return { x: component.x, y: component.y + ((i + 1) * d.h) / (d.ins + 1) };
};
export const gateOut = (type, ins, state) => {
  const a = bit(ins?.[0]);
  const b = bit(ins?.[1]);
  if (type === "switch") return bit(state?.value);
  if (type === "and") return a && b ? 1 : 0;
  if (type === "or") return a || b ? 1 : 0;
  if (type === "not") return a ? 0 : 1;
  if (type === "nand") return a && b ? 0 : 1;
  if (type === "nor") return a || b ? 0 : 1;
  if (type === "xor") return a !== b ? 1 : 0;
  if (type === "xnor") return a === b ? 1 : 0;
  if (type === "led") return a;
  return 0;
};
export const wirePath = (s, e) => {
  const delta = Math.max(40, Math.abs(e.x - s.x) * 0.45);
  return `M ${s.x} ${s.y} C ${s.x + delta} ${s.y}, ${e.x - delta} ${e.y}, ${e.x} ${e.y}`;
};

export const edgeOf = (wire, compMap) => {
  if (!wire) return null;
  const fromComponentId = sid(wire?.from?.componentId);
  const fromPinId = sid(wire?.from?.pinId);
  const toComponentId = sid(wire?.to?.componentId);
  const toPinId = sid(wire?.to?.pinId);
  if (!fromComponentId || !fromPinId || !toComponentId || !toPinId) return null;
  const from = compMap.get(fromComponentId);
  const to = compMap.get(toComponentId);
  if (!from || !to) return null;
  if (!validOutput(from.type, fromPinId) || !validInput(to.type, toPinId)) return null;
  return { id: sid(wire.id), fromComponentId, toComponentId, fromPinId, toPinId, toInputIndex: pinIndex(toPinId, IN_PREFIX) };
};

export const hasCycle = (components, wires) => {
  const graph = new Map();
  const compMap = new Map(components.map((c) => [c.id, c]));
  components.forEach((c) => graph.set(c.id, []));
  wires.forEach((w) => {
    const e = edgeOf(w, compMap);
    if (e) graph.get(e.fromComponentId)?.push(e.toComponentId);
  });
  const mark = new Map();
  const dfs = (id) => {
    const m = mark.get(id) || 0;
    if (m === 1) return true;
    if (m === 2) return false;
    mark.set(id, 1);
    const next = graph.get(id) || [];
    for (const n of next) if (dfs(n)) return true;
    mark.set(id, 2);
    return false;
  };
  for (const id of graph.keys()) if (dfs(id)) return true;
  return false;
};
export const addCreatesCycle = (components, wires, candidate) => hasCycle(components, [...wires, candidate]);

export const evaluate = (components, wires) => {
  const compMap = new Map(components.map((c) => [c.id, c]));
  const insMap = new Map();
  const outMap = new Map();
  const wireMap = new Map();
  const outEdges = new Map();
  const indeg = new Map();

  components.forEach((c) => {
    const d = TYPES[c.type];
    if (!d) return;
    insMap.set(c.id, new Array(d.ins).fill(0));
    outMap.set(c.id, c.type === "switch" ? bit(c.state?.value) : 0);
    outEdges.set(c.id, []);
    indeg.set(c.id, 0);
  });

  const inputUsed = new Set();
  wires.forEach((w) => {
    const e = edgeOf(w, compMap);
    if (!e) return;
    const key = `${e.toComponentId}:${e.toInputIndex}`;
    if (inputUsed.has(key)) return;
    inputUsed.add(key);
    outEdges.get(e.fromComponentId)?.push(e);
    indeg.set(e.toComponentId, (indeg.get(e.toComponentId) || 0) + 1);
  });

  const applyNode = (id) => {
    const c = compMap.get(id);
    if (!c) return;
    const o = gateOut(c.type, insMap.get(id), c.state);
    outMap.set(id, o);
    (outEdges.get(id) || []).forEach((e) => {
      wireMap.set(e.id, o);
      const arr = insMap.get(e.toComponentId);
      if (arr) arr[e.toInputIndex] = o;
    });
  };

  const q = [];
  components.forEach((c) => {
    if ((indeg.get(c.id) || 0) === 0) q.push(c.id);
  });
  const topo = [];
  while (q.length) {
    const id = q.shift();
    topo.push(id);
    (outEdges.get(id) || []).forEach((e) => {
      const n = (indeg.get(e.toComponentId) || 0) - 1;
      indeg.set(e.toComponentId, n);
      if (n === 0) q.push(e.toComponentId);
    });
  }

  const cyclic = topo.length !== components.length;
  let unstable = false;
  if (!cyclic) {
    topo.forEach(applyNode);
  } else {
    const limit = Math.max(12, components.length * 4);
    let changed = true;
    let iter = 0;
    while (changed && iter < limit) {
      changed = false;
      components.forEach((c) => {
        const nOut = gateOut(c.type, insMap.get(c.id), c.state);
        if ((outMap.get(c.id) || 0) !== nOut) {
          outMap.set(c.id, nOut);
          changed = true;
        }
        (outEdges.get(c.id) || []).forEach((e) => {
          wireMap.set(e.id, nOut);
          const arr = insMap.get(e.toComponentId);
          if (arr && arr[e.toInputIndex] !== nOut) {
            arr[e.toInputIndex] = nOut;
            changed = true;
          }
        });
      });
      iter += 1;
    }
    unstable = changed;
  }

  const ledMap = new Map();
  components.forEach((c) => {
    if (c.type === "led") ledMap.set(c.id, bit(insMap.get(c.id)?.[0]));
  });

  return { insMap, outMap, wireMap, ledMap, cyclic, unstable };
};

export const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
  const rawComponents = Array.isArray(payload.components) ? payload.components : [];
  const rawWires = Array.isArray(payload.wires) ? payload.wires : [];
  const components = [];
  const ids = new Set();
  let idx = 1;

  rawComponents.forEach((r) => {
    if (!r || typeof r !== "object") return;
    const type = sid(r.type).toLowerCase();
    if (!TYPES[type]) return;
    let id = sid(r.id, `cmp_${idx++}`);
    while (ids.has(id)) id = `${id}-${idx++}`;
    ids.add(id);
    const rot = Number(r.rotation);
    components.push({
      id,
      type,
      x: snap(Number(r.x) || 0),
      y: snap(Number(r.y) || 0),
      rotation: Number.isFinite(rot) ? rot : 0,
      state: type === "switch" ? { value: bit(r?.state?.value ?? r?.value) } : {},
    });
  });

  const compMap = new Map(components.map((c) => [c.id, c]));
  const wires = [];
  const wIds = new Set();
  const inputUsed = new Set();
  let dropped = 0;
  let wIdx = 1;

  rawWires.forEach((r) => {
    if (!r || typeof r !== "object") {
      dropped += 1;
      return;
    }
    const candidate = {
      id: sid(r.id, `wire_${wIdx++}`),
      from: { componentId: sid(r?.from?.componentId), pinId: sid(r?.from?.pinId, OUT) },
      to: { componentId: sid(r?.to?.componentId), pinId: sid(r?.to?.pinId) },
    };
    while (wIds.has(candidate.id)) candidate.id = `${candidate.id}-${wIdx++}`;
    const e = edgeOf(candidate, compMap);
    if (!e) {
      dropped += 1;
      return;
    }
    const key = `${e.toComponentId}:${e.toInputIndex}`;
    if (inputUsed.has(key) || addCreatesCycle(components, wires, candidate)) {
      dropped += 1;
      return;
    }
    inputUsed.add(key);
    wIds.add(candidate.id);
    wires.push(candidate);
  });

  return { components, wires, dropped };
};

export const exportPayload = (components, wires) => ({
  components: components.map((c) => ({
    id: c.id,
    type: c.type,
    x: c.x,
    y: c.y,
    rotation: Number(c.rotation) || 0,
    state: c.type === "switch" ? { value: bit(c.state?.value) } : {},
  })),
  wires: wires.map((w) => ({
    id: w.id,
    from: { componentId: w.from.componentId, pinId: w.from.pinId },
    to: { componentId: w.to.componentId, pinId: w.to.pinId },
  })),
});

export const pinLabel = (pinId) => {
  if (pinId === OUT) return "OUT";
  const i = pinIndex(pinId, IN_PREFIX);
  return i >= 0 ? `IN ${i + 1}` : pinId;
};

export const toolbarButtonClass = (variant) =>
  `${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_VARIANTS[variant] || TOOLBAR_BUTTON_VARIANTS.neutral}`;

export const panelButtonClass = (variant) =>
  `${PANEL_BUTTON_BASE} ${PANEL_BUTTON_VARIANTS[variant] || PANEL_BUTTON_VARIANTS.neutral}`;

export function GateSymbol({ type, size = 14 }) {
  if (type === "switch") return <Power size={size} strokeWidth={2.2} />;
  if (type === "led") return <Lightbulb size={size} strokeWidth={2.2} />;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "and" || type === "nand" ? (
        <>
          <line x1="1" y1="8" x2="6" y2="8" />
          <line x1="1" y1="16" x2="6" y2="16" />
          <path d="M6 5H11.5A6.5 6.5 0 0 1 11.5 19H6Z" />
          {type === "nand" ? <circle cx="19" cy="12" r="1.7" /> : null}
          <line x1={type === "nand" ? 20.7 : 18} y1="12" x2="23" y2="12" />
        </>
      ) : null}

      {type === "or" || type === "nor" || type === "xor" || type === "xnor" ? (
        <>
          <line x1="1" y1="8" x2="6" y2="8" />
          <line x1="1" y1="16" x2="6" y2="16" />
          <path d="M6 5Q13 5 18 12Q13 19 6 19" />
          <path d="M6 5Q10 12 6 19" />
          {type === "xor" || type === "xnor" ? <path d="M4 5Q8 12 4 19" /> : null}
          {type === "nor" || type === "xnor" ? <circle cx="19" cy="12" r="1.7" /> : null}
          <line x1={type === "nor" || type === "xnor" ? 20.7 : 18} y1="12" x2="23" y2="12" />
        </>
      ) : null}

      {type === "not" ? (
        <>
          <line x1="1" y1="12" x2="6" y2="12" />
          <path d="M6 5L6 19L16 12Z" />
          <circle cx="18" cy="12" r="1.7" />
          <line x1="19.7" y1="12" x2="23" y2="12" />
        </>
      ) : null}
    </svg>
  );
}

export function ComponentGlyph({ type, compact = false }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border bg-gradient-to-br font-bold tracking-wide ${
        compact ? "h-6 w-6" : "h-8 min-w-[3.25rem] gap-1.5 px-2 text-[10px]"
      } ${COMPONENT_GLYPH_CLASS[type] || COMPONENT_GLYPH_CLASS.and}`}
      aria-hidden="true"
    >
      <GateSymbol type={type} size={compact ? 14 : 15} />
      {!compact ? <span>{COMPONENT_GLYPH[type] || "GATE"}</span> : null}
    </span>
  );
}
