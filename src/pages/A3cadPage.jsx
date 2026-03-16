import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Info,
  Lightbulb,
  Play,
  Power,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import logicGateSymbolsImage from "../assets/logic-gate-symbols.svg";

const GRID = 24;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const DRAG_MIME = "application/x-a3cad";
const OUT = "out-0";
const IN_PREFIX = "in-";

const TYPES = {
  switch: { label: "Input Switch", short: "SW", ins: 0, outs: 1, w: 132, h: 84, cls: "from-amber-500 to-orange-600", logic: "Q = toggle", desc: "Binary source" },
  led: { label: "Output LED", short: "LED", ins: 1, outs: 0, w: 132, h: 84, cls: "from-emerald-500 to-green-700", logic: "LED = A", desc: "Visual output" },
  and: { label: "AND Gate", short: "AND", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = A && B", desc: "True only when both inputs are true" },
  or: { label: "OR Gate", short: "OR", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = A || B", desc: "True when any input is true" },
  not: { label: "NOT Gate", short: "NOT", ins: 1, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = !A", desc: "Inverter" },
  nand: { label: "NAND Gate", short: "NAND", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = !(A && B)", desc: "AND then invert" },
  nor: { label: "NOR Gate", short: "NOR", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = !(A || B)", desc: "OR then invert" },
  xor: { label: "XOR Gate", short: "XOR", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = (A !== B)", desc: "True when inputs differ" },
  xnor: { label: "XNOR Gate", short: "XNOR", ins: 2, outs: 1, w: 132, h: 84, cls: "from-slate-700 to-slate-900", logic: "Q = (A === B)", desc: "True when inputs match" },
};

const LIB_ORDER = ["switch", "led", "and", "or", "not", "nand", "nor", "xor", "xnor"];
const GUIDE_GATE_ORDER = ["or", "nor", "and", "nand", "xor", "xnor", "not"];
const GUIDE_IO_ORDER = ["switch", "led"];

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

const START_COMPONENTS = Object.freeze([
  { id: "cmp_1", type: "switch", x: 72, y: 96, rotation: 0, state: { value: 0 } },
  { id: "cmp_2", type: "switch", x: 72, y: 216, rotation: 0, state: { value: 0 } },
  { id: "cmp_3", type: "and", x: 288, y: 156, rotation: 0, state: {} },
  { id: "cmp_4", type: "led", x: 528, y: 156, rotation: 0, state: {} },
]);

const START_WIRES = Object.freeze([
  { id: "wire_1", from: { componentId: "cmp_1", pinId: OUT }, to: { componentId: "cmp_3", pinId: "in-0" } },
  { id: "wire_2", from: { componentId: "cmp_2", pinId: OUT }, to: { componentId: "cmp_3", pinId: "in-1" } },
  { id: "wire_3", from: { componentId: "cmp_3", pinId: OUT }, to: { componentId: "cmp_4", pinId: "in-0" } },
]);

const cloneComponents = () => START_COMPONENTS.map((c) => ({ ...c, state: { ...(c.state || {}) } }));
const cloneWires = () => START_WIRES.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } }));
const cloneCircuitState = (components, wires) => ({
  components: components.map((c) => ({ ...c, state: { ...(c.state || {}) } })),
  wires: wires.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } })),
});
const bit = (v) => (Number(v) ? 1 : 0);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snap = (v) => Math.round(v / GRID) * GRID;
const sid = (v, fallback = "") => String(v ?? "").trim() || fallback;
const inPin = (i) => `${IN_PREFIX}${i}`;
const pinIndex = (pin, prefix) => {
  if (typeof pin !== "string" || !pin.startsWith(prefix)) return -1;
  const n = Number(pin.slice(prefix.length));
  return Number.isInteger(n) && n >= 0 ? n : -1;
};
const validInput = (type, pin) => {
  const d = TYPES[type];
  const idx = pinIndex(pin, IN_PREFIX);
  return Boolean(d && d.ins > 0 && idx >= 0 && idx < d.ins);
};
const validOutput = (type, pin) => Boolean(TYPES[type]?.outs > 0 && pin === OUT);
const nextCounter = (items, prefix) => {
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
const toWorld = (x, y, viewport, rect) => ({
  x: (x - rect.left - viewport.x) / viewport.zoom,
  y: (y - rect.top - viewport.y) / viewport.zoom,
});
const textTarget = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
};
const pinPos = (component, pinId) => {
  const d = TYPES[component?.type];
  if (!d) return null;
  if (pinId === OUT && d.outs > 0) return { x: component.x + d.w, y: component.y + d.h / 2 };
  const i = pinIndex(pinId, IN_PREFIX);
  if (i < 0 || i >= d.ins) return null;
  return { x: component.x, y: component.y + ((i + 1) * d.h) / (d.ins + 1) };
};
const gateOut = (type, ins, state) => {
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
const wirePath = (s, e) => {
  const delta = Math.max(40, Math.abs(e.x - s.x) * 0.45);
  return `M ${s.x} ${s.y} C ${s.x + delta} ${s.y}, ${e.x - delta} ${e.y}, ${e.x} ${e.y}`;
};

const edgeOf = (wire, compMap) => {
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

const hasCycle = (components, wires) => {
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
const addCreatesCycle = (components, wires, candidate) => hasCycle(components, [...wires, candidate]);

const evaluate = (components, wires) => {
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

const sanitizePayload = (payload) => {
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

const exportPayload = (components, wires) => ({
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

const pinLabel = (pinId) => {
  if (pinId === OUT) return "OUT";
  const i = pinIndex(pinId, IN_PREFIX);
  return i >= 0 ? `IN ${i + 1}` : pinId;
};

const toolbarButtonClass = (variant) =>
  `${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_VARIANTS[variant] || TOOLBAR_BUTTON_VARIANTS.neutral}`;

const panelButtonClass = (variant) =>
  `${PANEL_BUTTON_BASE} ${PANEL_BUTTON_VARIANTS[variant] || PANEL_BUTTON_VARIANTS.neutral}`;

function GateSymbol({ type, size = 14 }) {
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

function ComponentGlyph({ type, compact = false }) {
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

export default function A3cadPage() {
  const [components, setComponents] = useState(() => cloneComponents());
  const [wires, setWires] = useState(() => cloneWires());
  const [selection, setSelection] = useState(null);
  const [viewport, setViewport] = useState({ x: 170, y: 100, zoom: 1 });
  const [draftWire, setDraftWire] = useState(null);
  const [running, setRunning] = useState(true);
  const [status, setStatus] = useState("Starter AND circuit loaded.");
  const [frozen, setFrozen] = useState(() => evaluate(START_COMPONENTS, START_WIRES));
  const [gateGuideOpen, setGateGuideOpen] = useState(false);

  const workspaceRef = useRef(null);
  const fileInputRef = useRef(null);
  const componentIdRef = useRef(nextCounter(START_COMPONENTS, "cmp"));
  const wireIdRef = useRef(nextCounter(START_WIRES, "wire"));
  const interactionRef = useRef({ pan: null, move: null, wire: null });
  const historyRef = useRef({ past: [], future: [] });
  const [, setHistoryTick] = useState(0);

  const componentsRef = useRef(components);
  const wiresRef = useRef(wires);
  const viewportRef = useRef(viewport);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);
  useEffect(() => {
    wiresRef.current = wires;
  }, [wires]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const componentMap = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const live = useMemo(() => evaluate(components, wires), [components, wires]);

  useEffect(() => {
    if (running) setFrozen(live);
  }, [running, live]);

  const sim = running ? live : frozen;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const warning = useMemo(() => {
    if (sim.cyclic) return "Cycle detected. New cyclic connections are blocked.";
    if (sim.unstable) return "Loop did not settle before iteration limit.";
    return "";
  }, [sim.cyclic, sim.unstable]);

  const selectedComponent = selection?.kind === "component" ? componentMap.get(selection.id) || null : null;
  const selectedWire = selection?.kind === "wire" ? wires.find((w) => w.id === selection.id) || null : null;

  const getWorldPoint = useCallback((x, y) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toWorld(x, y, viewportRef.current, rect);
  }, []);

  const pushHistory = useCallback(() => {
    const snapshot = cloneCircuitState(componentsRef.current, wiresRef.current);
    historyRef.current.past.push(snapshot);
    if (historyRef.current.past.length > 120) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    setHistoryTick((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const current = cloneCircuitState(componentsRef.current, wiresRef.current);
    const previous = past.pop();
    future.push(current);
    setComponents(previous.components);
    setWires(previous.wires);
    setSelection(null);
    setDraftWire(null);
    setStatus("Undo applied.");
    setHistoryTick((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const current = cloneCircuitState(componentsRef.current, wiresRef.current);
    const next = future.pop();
    past.push(current);
    setComponents(next.components);
    setWires(next.wires);
    setSelection(null);
    setDraftWire(null);
    setStatus("Redo applied.");
    setHistoryTick((v) => v + 1);
  }, []);

  const fitView = useCallback(() => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentComponents = componentsRef.current;
    if (currentComponents.length === 0) {
      setViewport({ x: rect.width * 0.5, y: rect.height * 0.5, zoom: 1 });
      setStatus("Viewport centered.");
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    currentComponents.forEach((component) => {
      const d = TYPES[component.type];
      if (!d) return;
      minX = Math.min(minX, component.x);
      minY = Math.min(minY, component.y);
      maxX = Math.max(maxX, component.x + d.w);
      maxY = Math.max(maxY, component.y + d.h);
    });

    const pad = 120;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const targetZoom = clamp(
      Math.min((rect.width - pad) / width, (rect.height - pad) / height),
      MIN_ZOOM,
      MAX_ZOOM
    );
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    setViewport({
      x: rect.width * 0.5 - cx * targetZoom,
      y: rect.height * 0.5 - cy * targetZoom,
      zoom: Number(targetZoom.toFixed(3)),
    });
    setStatus("Viewport fitted to circuit.");
  }, []);

  const addComponent = useCallback((type, p) => {
    const d = TYPES[type];
    if (!d) return;
    pushHistory();
    const next = {
      id: `cmp_${componentIdRef.current++}`,
      type,
      x: snap(p.x - d.w / 2),
      y: snap(p.y - d.h / 2),
      rotation: 0,
      state: type === "switch" ? { value: 0 } : {},
    };
    setComponents((prev) => [...prev, next]);
    setSelection({ kind: "component", id: next.id });
    setStatus(`${d.label} placed.`);
  }, [pushHistory]);

  const connectPins = useCallback((fromPin, toPin) => {
    const comps = componentsRef.current;
    const ws = wiresRef.current;
    const map = new Map(comps.map((c) => [c.id, c]));
    const from = map.get(fromPin.componentId);
    const to = map.get(toPin.componentId);
    if (!from || !to) return;
    if (!validOutput(from.type, fromPin.pinId) || !validInput(to.type, toPin.pinId)) {
      setStatus("Connect output pin to input pin.");
      return;
    }
    if (ws.some((w) => w.to.componentId === toPin.componentId && w.to.pinId === toPin.pinId)) {
      setStatus("Each input pin accepts only one wire.");
      return;
    }
    if (ws.some((w) => w.from.componentId === fromPin.componentId && w.from.pinId === fromPin.pinId && w.to.componentId === toPin.componentId && w.to.pinId === toPin.pinId)) {
      setStatus("Pins are already connected.");
      return;
    }
    const next = {
      id: `wire_${wireIdRef.current++}`,
      from: { componentId: fromPin.componentId, pinId: fromPin.pinId },
      to: { componentId: toPin.componentId, pinId: toPin.pinId },
    };
    if (addCreatesCycle(comps, ws, next)) {
      setStatus("Cyclic wiring is blocked.");
      return;
    }
    pushHistory();
    setWires((prev) => [...prev, next]);
    setSelection({ kind: "wire", id: next.id });
    setStatus("Wire connected.");
  }, [pushHistory]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    pushHistory();
    if (selection.kind === "component") {
      const id = selection.id;
      setComponents((prev) => prev.filter((c) => c.id !== id));
      setWires((prev) => prev.filter((w) => w.from.componentId !== id && w.to.componentId !== id));
      setSelection(null);
      setStatus("Component removed.");
      return;
    }
    if (selection.kind === "wire") {
      setWires((prev) => prev.filter((w) => w.id !== selection.id));
      setSelection(null);
      setStatus("Wire removed.");
    }
  }, [pushHistory, selection]);

  const duplicateSelection = useCallback(() => {
    if (!selection || selection.kind !== "component") return;
    const src = componentsRef.current.find((c) => c.id === selection.id);
    if (!src) return;
    pushHistory();
    const next = {
      ...src,
      id: `cmp_${componentIdRef.current++}`,
      x: snap(src.x + GRID * 2),
      y: snap(src.y + GRID * 2),
      state: { ...(src.state || {}) },
    };
    setComponents((prev) => [...prev, next]);
    setSelection({ kind: "component", id: next.id });
    setStatus("Component duplicated.");
  }, [pushHistory, selection]);

  const zoomAt = useCallback((nextZoomRaw, x, y) => {
    setViewport((prev) => {
      const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === prev.zoom) return prev;
      const wx = (x - prev.x) / prev.zoom;
      const wy = (y - prev.y) / prev.zoom;
      return { x: x - wx * nextZoom, y: y - wy * nextZoom, zoom: Number(nextZoom.toFixed(3)) };
    });
  }, []);

  const zoomBy = useCallback((factor) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(viewportRef.current.zoom * factor, rect.width / 2, rect.height / 2);
  }, [zoomAt]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(viewportRef.current.zoom * factor, x, y);
  }, [zoomAt]);

  const handleWorkspaceMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-component-root]") || target.closest("[data-wire-root]") || target.closest("[data-pin-kind]")) return;
    interactionRef.current.pan = {
      sx: event.clientX,
      sy: event.clientY,
      ox: viewportRef.current.x,
      oy: viewportRef.current.y,
    };
    setSelection(null);
  }, []);

  const handleComponentMouseDown = useCallback((event, componentId) => {
    if (event.button !== 0 || interactionRef.current.wire) return;
    const c = componentsRef.current.find((item) => item.id === componentId);
    if (!c) return;
    const p = getWorldPoint(event.clientX, event.clientY);
    interactionRef.current.move = {
      componentId,
      dx: p.x - c.x,
      dy: p.y - c.y,
      committed: false,
      ox: c.x,
      oy: c.y,
    };
    setSelection({ kind: "component", id: componentId });
    event.preventDefault();
    event.stopPropagation();
  }, [getWorldPoint]);

  const handleOutputPinMouseDown = useCallback((event, componentId, pinId) => {
    if (event.button !== 0) return;
    const c = componentsRef.current.find((item) => item.id === componentId);
    if (!c) return;
    const pos = pinPos(c, pinId);
    if (!pos) return;
    interactionRef.current.wire = { from: { componentId, pinId } };
    setDraftWire({ from: { componentId, pinId }, to: pos });
    setSelection(null);
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const toggleSwitch = useCallback((componentId) => {
    pushHistory();
    setComponents((prev) => prev.map((c) => c.id === componentId && c.type === "switch" ? { ...c, state: { ...c.state, value: c.state?.value ? 0 : 1 } } : c));
  }, [pushHistory]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(DRAG_MIME);
    if (!TYPES[type]) return;
    addComponent(type, getWorldPoint(event.clientX, event.clientY));
  }, [addComponent, getWorldPoint]);

  const resetSwitches = useCallback(() => {
    pushHistory();
    setComponents((prev) => prev.map((c) => c.type === "switch" ? { ...c, state: { ...c.state, value: 0 } } : c));
    setRunning(true);
    setStatus("All switches reset to 0.");
  }, [pushHistory]);

  const clearWorkspace = useCallback(() => {
    if (!componentsRef.current.length && !wiresRef.current.length) return;
    pushHistory();
    setComponents([]);
    setWires([]);
    setSelection(null);
    setStatus("Workspace cleared.");
  }, [pushHistory]);

  const loadExample = useCallback(() => {
    const cs = cloneComponents();
    const ws = cloneWires();
    pushHistory();
    setComponents(cs);
    setWires(ws);
    setSelection(null);
    setRunning(true);
    setStatus("Starter AND circuit loaded.");
    componentIdRef.current = nextCounter(cs, "cmp");
    wireIdRef.current = nextCounter(ws, "wire");
  }, [pushHistory]);

  const addFromGateGuide = useCallback((type) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    addComponent(type, getWorldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    setGateGuideOpen(false);
  }, [addComponent, getWorldPoint]);

  const saveJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(exportPayload(componentsRef.current, wiresRef.current), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a3cad-circuit-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Circuit JSON exported.");
  }, []);

  const openLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const loadJson = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const clean = sanitizePayload(parsed);
      pushHistory();
      setComponents(clean.components);
      setWires(clean.wires);
      setSelection(null);
      setRunning(true);
      componentIdRef.current = nextCounter(clean.components, "cmp");
      wireIdRef.current = nextCounter(clean.wires, "wire");
      setStatus(clean.dropped ? `Loaded with ${clean.dropped} invalid wire(s) skipped.` : "Circuit loaded.");
    } catch {
      setStatus("Load failed. Provide valid A3cad JSON.");
    } finally {
      event.target.value = "";
    }
  }, [pushHistory]);

  useEffect(() => {
    const onMove = (event) => {
      const pan = interactionRef.current.pan;
      if (pan) {
        setViewport((prev) => ({ ...prev, x: pan.ox + (event.clientX - pan.sx), y: pan.oy + (event.clientY - pan.sy) }));
        return;
      }
      const move = interactionRef.current.move;
      if (move) {
        const p = getWorldPoint(event.clientX, event.clientY);
        const nextX = snap(p.x - move.dx);
        const nextY = snap(p.y - move.dy);
        if (!move.committed && (nextX !== move.ox || nextY !== move.oy)) {
          pushHistory();
          move.committed = true;
        }
        setComponents((prev) =>
          prev.map((c) => (c.id === move.componentId ? { ...c, x: nextX, y: nextY } : c))
        );
        return;
      }
      if (interactionRef.current.wire) {
        const p = getWorldPoint(event.clientX, event.clientY);
        setDraftWire((prev) => prev ? { ...prev, to: { x: p.x, y: p.y } } : prev);
      }
    };

    const onUp = (event) => {
      interactionRef.current.pan = null;
      interactionRef.current.move = null;
      const wire = interactionRef.current.wire;
      if (!wire) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const pin = target?.closest?.("[data-pin-kind='input']");
      if (pin instanceof HTMLElement) {
        const componentId = sid(pin.dataset.componentId);
        const pinId = sid(pin.dataset.pinId);
        if (componentId && pinId) connectPins(wire.from, { componentId, pinId });
      }
      interactionRef.current.wire = null;
      setDraftWire(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [connectPins, getWorldPoint, pushHistory]);

  useEffect(() => {
    const onKey = (event) => {
      if (textTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === "Escape") {
        if (gateGuideOpen) {
          setGateGuideOpen(false);
          return;
        }
        interactionRef.current.wire = null;
        setDraftWire(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, duplicateSelection, gateGuideOpen, redo, selection, undo]);

  const renderedWires = useMemo(() => wires.map((wire) => {
    const from = componentMap.get(wire.from.componentId);
    const to = componentMap.get(wire.to.componentId);
    if (!from || !to) return null;
    const start = pinPos(from, wire.from.pinId);
    const end = pinPos(to, wire.to.pinId);
    if (!start || !end) return null;
    return { id: wire.id, path: wirePath(start, end) };
  }).filter(Boolean), [wires, componentMap]);

  const draftPreview = useMemo(() => {
    if (!draftWire) return null;
    const from = componentMap.get(draftWire.from.componentId);
    if (!from) return null;
    const start = pinPos(from, draftWire.from.pinId);
    if (!start) return null;
    return { path: wirePath(start, draftWire.to), end: draftWire.to };
  }, [draftWire, componentMap]);

  const worldStyle = useMemo(() => ({
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: "0 0",
  }), [viewport]);

  const gridStyle = useMemo(() => {
    const minor = Math.max(8, GRID * viewport.zoom);
    const major = minor * 5;
    const fix = (offset, step) => ((offset % step) + step) % step;
    const mx = fix(viewport.x, minor);
    const my = fix(viewport.y, minor);
    const gx = fix(viewport.x, major);
    const gy = fix(viewport.y, major);
    return {
      backgroundColor: "#f8fafc",
      backgroundImage: "linear-gradient(to right, rgba(15,23,42,0.07) 1px, transparent 1px),linear-gradient(to bottom, rgba(15,23,42,0.07) 1px, transparent 1px),linear-gradient(to right, rgba(15,23,42,0.13) 1px, transparent 1px),linear-gradient(to bottom, rgba(15,23,42,0.13) 1px, transparent 1px)",
      backgroundSize: `${minor}px ${minor}px,${minor}px ${minor}px,${major}px ${major}px,${major}px ${major}px`,
      backgroundPosition: `${mx}px ${my}px,${mx}px ${my}px,${gx}px ${gy}px,${gx}px ${gy}px`,
    };
  }, [viewport]);

  const selectedDef = selectedComponent ? TYPES[selectedComponent.type] : null;
  const selectedInputs = selectedComponent ? sim.insMap.get(selectedComponent.id) || [] : [];
  const selectedOutput = selectedComponent ? bit(sim.outMap.get(selectedComponent.id)) : 0;
  const selectedWireSignal = selectedWire ? bit(sim.wireMap.get(selectedWire.id)) : 0;

  return (
    <section className="mx-auto w-full max-w-[1800px] space-y-4">
      <header className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Power size={14} />
              A3cad Logic Simulator
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Digital Logic Playground</h2>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">Drag gates, wire pins, toggle switches, and observe real-time outputs.</p>
          </div>
          <div className="flex flex-col gap-2 text-xs sm:items-end">
            <span className={`inline-flex rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.14em] ${running ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {running ? "Running" : "Stopped"}
            </span>
            <p className="max-w-[34rem] text-slate-600 sm:text-right">{status}</p>
          </div>
        </div>
        {warning ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{warning}</p>
          </div>
        ) : null}
      </header>

      <div className="flex h-[calc(100vh-12.8rem)] min-h-[720px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50/80 p-4 lg:w-72 lg:border-b-0 lg:border-r">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">Component Library</h3>
          <p className="mt-1 text-xs text-slate-500">Drag to workspace or click to place.</p>
          <button
            type="button"
            onClick={() => setGateGuideOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Info size={13} />
            Gate Guide
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {LIB_ORDER.map((type) => {
              const d = TYPES[type];
              return (
                <button
                  key={type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    const rect = workspaceRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    addComponent(type, getWorldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1"
                >
                  <div className="flex items-center gap-2">
                    <ComponentGlyph type={type} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{d.label}</p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        {d.ins} in / {d.outs} out
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Shortcuts</p>
            <p className="mt-1">Delete: remove selected item</p>
            <p>Ctrl/Cmd + D: duplicate component</p>
            <p>Ctrl/Cmd + Z: undo</p>
            <p>Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: redo</p>
            <p>Esc: cancel wire creation</p>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            <button
              type="button"
              onClick={() => {
                setRunning(true);
                setStatus("Simulation running.");
              }}
              className={toolbarButtonClass("run")}
              title="Start real-time simulation"
            >
              <Play size={14} />
              Run
            </button>
            <button
              type="button"
              onClick={() => {
                setFrozen(live);
                setRunning(false);
                setStatus("Simulation frozen.");
              }}
              className={toolbarButtonClass("stop")}
              title="Freeze outputs"
            >
              <Square size={14} />
              Stop
            </button>
            <button type="button" onClick={resetSwitches} className={toolbarButtonClass("neutral")}>
              <RotateCcw size={14} />
              Reset
            </button>
            <button type="button" onClick={clearWorkspace} className={toolbarButtonClass("danger")}>
              <Trash2 size={14} />
              Clear
            </button>
            <button type="button" onClick={saveJson} className={toolbarButtonClass("neutral")}>
              <Save size={14} />
              Save
            </button>
            <button type="button" onClick={openLoad} className={toolbarButtonClass("neutral")}>
              <Upload size={14} />
              Load
            </button>
            <button type="button" onClick={loadExample} className={toolbarButtonClass("accent")}>
              <Play size={14} />
              Example
            </button>
            <button type="button" onClick={undo} disabled={!canUndo} className={toolbarButtonClass("neutral")}>
              <Undo2 size={14} />
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} className={toolbarButtonClass("neutral")}>
              <Redo2 size={14} />
              Redo
            </button>
            <button type="button" onClick={fitView} className={toolbarButtonClass("neutral")}>
              <ZoomIn size={14} />
              Fit View
            </button>
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-flex" />
            <button type="button" onClick={duplicateSelection} disabled={!selectedComponent} className={toolbarButtonClass("neutral")}>
              <Copy size={14} />
              Duplicate
            </button>
            <button type="button" onClick={deleteSelection} disabled={!selection} className={toolbarButtonClass("danger")}>
              <Trash2 size={14} />
              Delete
            </button>
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-flex" />
            <button type="button" onClick={() => zoomBy(1.1)} className={toolbarButtonClass("neutral")} aria-label="Zoom in">
              <ZoomIn size={14} />
            </button>
            <button type="button" onClick={() => zoomBy(0.9)} className={toolbarButtonClass("neutral")} aria-label="Zoom out">
              <ZoomOut size={14} />
            </button>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{Math.round(viewport.zoom * 100)}%</span>
          </div>

          <div className="relative min-h-0 flex-1">
            <div ref={workspaceRef} className="relative h-full w-full overflow-hidden bg-slate-100 select-none" onMouseDown={handleWorkspaceMouseDown} onWheel={handleWheel} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              <div className="absolute inset-0" style={gridStyle} aria-hidden="true" />
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
                  {renderedWires.map((wire) => {
                    const active = selection?.kind === "wire" && selection.id === wire.id;
                    const signal = bit(sim.wireMap.get(wire.id));
                    const color = signal ? "#22c55e" : "#94a3b8";
                    return (
                      <g key={wire.id}>
                        <path d={wire.path} fill="none" stroke="transparent" strokeWidth="14" data-wire-root style={{ cursor: "pointer" }} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelection({ kind: "wire", id: wire.id }); }} />
                        <path d={wire.path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 4.5 : 3.2} opacity={active ? 1 : 0.95} pointerEvents="none" />
                      </g>
                    );
                  })}
                  {draftPreview ? (
                    <>
                      <path d={draftPreview.path} fill="none" stroke="#38bdf8" strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={draftPreview.end.x} cy={draftPreview.end.y} r="4" fill="#38bdf8" />
                    </>
                  ) : null}
                </g>
              </svg>

              <div className="absolute inset-0 origin-top-left" style={worldStyle}>
                {components.map((component) => {
                  const d = TYPES[component.type];
                  if (!d) return null;
                  const active = selection?.kind === "component" && selection.id === component.id;
                  const inputValues = sim.insMap.get(component.id) || [];
                  const outputValue = bit(sim.outMap.get(component.id));
                  const ledValue = bit(sim.ledMap.get(component.id));
                  const switchValue = bit(component.state?.value);
                  return (
                    <article
                      key={component.id}
                      data-component-root
                      className="absolute"
                      style={{ left: component.x, top: component.y, width: d.w, height: d.h }}
                      onMouseDown={(event) => handleComponentMouseDown(event, component.id)}
                      onClick={(event) => { event.stopPropagation(); setSelection({ kind: "component", id: component.id }); }}
                    >
                      <div className={`relative flex h-full flex-col rounded-2xl border border-white/20 bg-gradient-to-br ${d.cls} p-2 text-white shadow-lg`}>
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                          <span className="inline-flex items-center gap-1.5">
                            <ComponentGlyph type={component.type} compact />
                            <span>{d.short}</span>
                          </span>
                          <span>Q: {outputValue}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-white">{d.label}</p>
                        <div className="mt-2 flex flex-1 items-center justify-center">
                          {component.type === "switch" ? (
                            <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleSwitch(component.id); }} className={`inline-flex min-w-[3rem] items-center justify-center rounded-lg border px-3 py-1.5 text-lg font-bold ${switchValue ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
                              {switchValue}
                            </button>
                          ) : null}
                          {component.type === "led" ? (
                            <span className={`inline-flex h-10 w-10 rounded-full border-2 ${ledValue ? "border-emerald-100 bg-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.85)]" : "border-slate-500 bg-slate-700"}`} />
                          ) : null}
                          {component.type !== "switch" && component.type !== "led" ? (
                            <div className="rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/90">{d.logic}</div>
                          ) : null}
                        </div>
                        {d.ins > 0 ? <div className="text-[11px] text-white/85">In: {inputValues.map((v) => bit(v)).join("  ")}</div> : null}
                        <p className="truncate text-[10px] text-white/70">{component.id}</p>
                        {active ? (
                          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-sky-300">
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-300" />
                            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-300" />
                            <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-sky-300" />
                            <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-sky-300" />
                          </div>
                        ) : null}
                        {Array.from({ length: d.ins }, (_, i) => {
                          const pinId = inPin(i);
                          const val = bit(inputValues[i]);
                          return (
                            <button
                              key={pinId}
                              type="button"
                              data-pin-kind="input"
                              data-component-id={component.id}
                              data-pin-id={pinId}
                              onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); }}
                              className={`absolute -left-[7px] h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 ${val ? "border-emerald-100 bg-emerald-400" : "border-slate-100 bg-slate-400"}`}
                              style={{ top: `${((i + 1) / (d.ins + 1)) * 100}%` }}
                              aria-label={`Input pin ${i + 1}`}
                            />
                          );
                        })}
                        {d.outs > 0 ? (
                          <button type="button" data-pin-kind="output" data-component-id={component.id} data-pin-id={OUT} onMouseDown={(event) => handleOutputPinMouseDown(event, component.id, OUT)} className={`absolute -right-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 ${outputValue ? "border-emerald-100 bg-emerald-400" : "border-slate-100 bg-slate-400"}`} aria-label="Output pin" />
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 border-t border-slate-200 bg-slate-50/80 p-4 lg:w-80 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">Properties</h3>
          {selectedComponent && selectedDef ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected Component</p>
                <h4 className="mt-1 text-base font-semibold text-slate-900">{selectedDef.label}</h4>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">ID</dt><dd className="font-mono text-slate-800">{selectedComponent.id}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Type</dt><dd>{selectedComponent.type.toUpperCase()}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Position</dt><dd>({selectedComponent.x}, {selectedComponent.y})</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Pins</dt><dd>{selectedDef.ins} in / {selectedDef.outs} out</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Inputs</dt><dd>{selectedInputs.map((v) => bit(v)).join(", ") || "-"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Output</dt><dd className="font-semibold">{selectedOutput}</dd></div>
              </dl>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{selectedDef.desc}</p>
              {selectedComponent.type === "switch" ? (
                <button type="button" onClick={() => toggleSwitch(selectedComponent.id)} className={panelButtonClass("neutral")}>
                  <Power size={13} />
                  Toggle Switch ({bit(selectedComponent.state?.value)})
                </button>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={duplicateSelection} className={panelButtonClass("neutral")}>
                  <Copy size={13} />
                  Duplicate
                </button>
                <button type="button" onClick={deleteSelection} className={panelButtonClass("danger")}>
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </div>
          ) : null}

          {selectedWire ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected Wire</p>
                <h4 className="mt-1 text-base font-semibold text-slate-900">{selectedWire.id}</h4>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">From</dt><dd className="font-mono text-right">{selectedWire.from.componentId} ({pinLabel(selectedWire.from.pinId)})</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">To</dt><dd className="font-mono text-right">{selectedWire.to.componentId} ({pinLabel(selectedWire.to.pinId)})</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Signal</dt><dd className={`font-semibold ${selectedWireSignal ? "text-emerald-600" : "text-slate-600"}`}>{selectedWireSignal}</dd></div>
              </dl>
              <button type="button" onClick={deleteSelection} className={panelButtonClass("danger")}>
                <Trash2 size={13} />
                Delete Wire
              </button>
            </div>
          ) : null}

          {!selectedComponent && !selectedWire ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">No selection</p>
              <p className="mt-1">Select a component or wire to inspect details. Output pins support fan-out, each input pin accepts one wire.</p>
            </div>
          ) : null}
        </aside>
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={loadJson} />

      {gateGuideOpen ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="A3cad gate guide"
        >
          <button
            type="button"
            aria-label="Close gate guide"
            onClick={() => setGateGuideOpen(false)}
            className="ui-modal__scrim"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-4xl p-4 sm:p-5">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">A3cad</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Gate Guide</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Quick gate reference with input/output pins and logic formulas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGateGuideOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <X size={13} />
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-amber-900/40 bg-[#7a4a10]">
              <img
                src={logicGateSymbolsImage}
                alt="Logic gate symbols for OR, NOR, AND, NAND, XOR, XNOR, Buffer, and NOT gates."
                className="block w-full"
                loading="lazy"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Gate Symbols</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {GUIDE_GATE_ORDER.map((type) => {
                  const d = TYPES[type];
                  return (
                    <article
                      key={`guide-gate-${type}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <ComponentGlyph type={type} />
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                          {d.ins} / {d.outs}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-800">{d.label}</p>
                      <button
                        type="button"
                        onClick={() => addFromGateGuide(type)}
                        className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                      >
                        Add {d.short}
                      </button>
                    </article>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">Buffer is shown in the reference image only; use an input switch for pass-through behavior.</p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">I/O Components</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {GUIDE_IO_ORDER.map((type) => {
                  const d = TYPES[type];
                  return (
                    <button
                      key={`guide-io-${type}`}
                      type="button"
                      onClick={() => addFromGateGuide(type)}
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ComponentGlyph type={type} compact />
                        <span>{d.label}</span>
                      </span>
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        {d.ins} / {d.outs}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
