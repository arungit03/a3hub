import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Info,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import logicGateSymbolsImage from "../assets/logic-gate-symbols.svg";
import {
  addCreatesCycle,
  bit,
  clamp,
  cloneCircuitState,
  cloneComponents,
  cloneWires,
  ComponentGlyph,
  DRAG_MIME,
  evaluate,
  exportPayload,
  GateSymbol,
  GRID,
  GUIDE_GATE_ORDER,
  GUIDE_IO_ORDER,
  inPin,
  INITIAL_VIEWPORT,
  LIB_ORDER,
  MAX_ZOOM,
  MIN_ZOOM,
  nextCounter,
  OUT,
  panelButtonClass,
  pinLabel,
  pinPos,
  sanitizePayload,
  sid,
  snap,
  START_COMPONENTS,
  START_WIRES,
  textTarget,
  toolbarButtonClass,
  toWorld,
  touchDistance,
  touchMidpoint,
  TYPES,
  validInput,
  validOutput,
  wirePath,
} from "../features/a3cad/a3cadCore.jsx";
export default function A3cadPage() {
  const [components, setComponents] = useState(() => cloneComponents());
  const [wires, setWires] = useState(() => cloneWires());
  const [selection, setSelection] = useState(null);
  const [viewport, setViewport] = useState(() => ({ ...INITIAL_VIEWPORT }));
  const [draftWire, setDraftWire] = useState(null);
  const [status, setStatus] = useState("Starter AND circuit loaded.");
  const [componentLibraryOpen, setComponentLibraryOpen] = useState(false);
  const [gateGuideOpen, setGateGuideOpen] = useState(false);
  const [propertiesModalOpen, setPropertiesModalOpen] = useState(false);

  const workspaceRef = useRef(null);
  const fileInputRef = useRef(null);
  const componentIdRef = useRef(nextCounter(START_COMPONENTS, "cmp"));
  const wireIdRef = useRef(nextCounter(START_WIRES, "wire"));
  const interactionRef = useRef({ pan: null, move: null, wire: null });
  const touchGestureRef = useRef({
    mode: null,
    startDistance: 0,
    startViewport: null,
    anchorWorld: null,
  });
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
  const sim = live;
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

  const placeComponentFromLibrary = useCallback((type, closeLibrary = false) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    addComponent(type, getWorldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    if (closeLibrary) {
      setComponentLibraryOpen(false);
    }
  }, [addComponent, getWorldPoint]);

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

  const handleWorkspaceTouchStart = useCallback((event) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (event.touches.length >= 2) {
      const [touchA, touchB] = event.touches;
      const startViewport = viewportRef.current;
      const midpoint = touchMidpoint(touchA, touchB);
      touchGestureRef.current = {
        mode: "pinch",
        startDistance: touchDistance(touchA, touchB),
        startViewport,
        anchorWorld: {
          x: (midpoint.x - rect.left - startViewport.x) / startViewport.zoom,
          y: (midpoint.y - rect.top - startViewport.y) / startViewport.zoom,
        },
      };
      interactionRef.current.pan = null;
      event.preventDefault();
      return;
    }

    if (event.touches.length !== 1) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (
      target.closest("[data-component-root]") ||
      target.closest("[data-wire-root]") ||
      target.closest("[data-pin-kind]")
    ) {
      return;
    }

    const touch = event.touches[0];
    interactionRef.current.pan = {
      sx: touch.clientX,
      sy: touch.clientY,
      ox: viewportRef.current.x,
      oy: viewportRef.current.y,
    };
    setSelection(null);
  }, []);

  const handleWorkspaceTouchMove = useCallback((event) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (
      touchGestureRef.current.mode === "pinch" &&
      event.touches.length >= 2 &&
      touchGestureRef.current.startViewport &&
      touchGestureRef.current.anchorWorld
    ) {
      const [touchA, touchB] = event.touches;
      const midpoint = touchMidpoint(touchA, touchB);
      const nextDistance = touchDistance(touchA, touchB);
      const scale =
        nextDistance / Math.max(1, touchGestureRef.current.startDistance);
      const nextZoom = clamp(
        touchGestureRef.current.startViewport.zoom * scale,
        MIN_ZOOM,
        MAX_ZOOM
      );

      setViewport({
        x: midpoint.x - rect.left - touchGestureRef.current.anchorWorld.x * nextZoom,
        y: midpoint.y - rect.top - touchGestureRef.current.anchorWorld.y * nextZoom,
        zoom: Number(nextZoom.toFixed(3)),
      });
      event.preventDefault();
      return;
    }

    const pan = interactionRef.current.pan;
    if (pan && event.touches.length === 1) {
      const touch = event.touches[0];
      setViewport((prev) => ({
        ...prev,
        x: pan.ox + (touch.clientX - pan.sx),
        y: pan.oy + (touch.clientY - pan.sy),
      }));
      event.preventDefault();
    }
  }, []);

  const handleWorkspaceTouchEnd = useCallback((event) => {
    if (event.touches.length < 2) {
      touchGestureRef.current = {
        mode: null,
        startDistance: 0,
        startViewport: null,
        anchorWorld: null,
      };
    }

    if (event.touches.length === 0) {
      interactionRef.current.pan = null;
      return;
    }

    if (event.touches.length === 1) {
      interactionRef.current.pan = null;
    }
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

  const resetWorkspace = useCallback(() => {
    if (componentsRef.current.length || wiresRef.current.length) {
      pushHistory();
    }
    setComponents([]);
    setWires([]);
    setSelection(null);
    setDraftWire(null);
    setViewport({ ...INITIAL_VIEWPORT });
    componentIdRef.current = 1;
    wireIdRef.current = 1;
    setStatus("New blank workspace ready.");
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
    const element = workspaceRef.current;
    if (!element) return undefined;

    const onWheel = (event) => {
      const rect = element.getBoundingClientRect();
      if (!rect) return;

      event.preventDefault();

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const primaryDelta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (!Number.isFinite(primaryDelta) || primaryDelta === 0) return;

      const factor = Math.exp(-primaryDelta * 0.0035);
      zoomAt(viewportRef.current.zoom * factor, x, y);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [zoomAt]);

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
        if (componentLibraryOpen) {
          setComponentLibraryOpen(false);
          return;
        }
        if (gateGuideOpen) {
          setGateGuideOpen(false);
          return;
        }
        if (propertiesModalOpen) {
          setPropertiesModalOpen(false);
          return;
        }
        interactionRef.current.wire = null;
        setDraftWire(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [componentLibraryOpen, deleteSelection, duplicateSelection, gateGuideOpen, propertiesModalOpen, redo, selection, undo]);

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
  const hasSelection = Boolean(selectedComponent || selectedWire);
  const propertiesModalContent = (
    <>
      {selectedComponent && selectedDef ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
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
        <div className={`${selectedComponent ? "mt-3 " : ""}space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700`}>
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">No selection</p>
          <p className="mt-1">Select a component or wire to inspect details. Output pins support fan-out, each input pin accepts one wire.</p>
        </div>
      ) : null}
    </>
  );

  const renderLibraryCards = (
    closeLibraryOnPlace = false,
    gridClassName = "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1"
  ) => (
    <div className={gridClassName}>
      {LIB_ORDER.map((type) => {
        const d = TYPES[type];
        return (
          <button
            key={type}
            type="button"
            draggable={!closeLibraryOnPlace}
            onDragStart={(e) => {
              if (closeLibraryOnPlace) return;
              e.dataTransfer.setData(DRAG_MIME, type);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => placeComponentFromLibrary(type, closeLibraryOnPlace)}
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
  );

  const shortcutsPanel = (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <p className="font-semibold text-slate-700">Shortcuts</p>
      <p className="mt-1">Delete: remove selected item</p>
      <p>Ctrl/Cmd + D: duplicate component</p>
      <p>Ctrl/Cmd + Z: undo</p>
      <p>Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: redo</p>
      <p>Esc: cancel wire creation</p>
    </div>
  );

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

      <div className="flex h-[calc(100vh-12.8rem)] min-h-[560px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:min-h-[720px] lg:flex-row">
        <aside className="hidden w-full shrink-0 border-b border-slate-200 bg-slate-50/80 p-4 lg:block lg:w-72 lg:border-b-0 lg:border-r">
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
          {renderLibraryCards(false)}
          {shortcutsPanel}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            <button type="button" onClick={() => setComponentLibraryOpen(true)} className={`lg:hidden ${toolbarButtonClass("accent")}`}>
              <GateSymbol type="and" size={14} />
              Component
            </button>
            <button type="button" onClick={resetWorkspace} className={toolbarButtonClass("neutral")}>
              <RotateCcw size={14} />
              New
            </button>
            <button type="button" onClick={saveJson} className={toolbarButtonClass("neutral")}>
              <Save size={14} />
              Save
            </button>
            <button type="button" onClick={openLoad} className={toolbarButtonClass("neutral")}>
              <Upload size={14} />
              Load
            </button>
            <button type="button" onClick={undo} disabled={!canUndo} className={toolbarButtonClass("neutral")}>
              <Undo2 size={14} />
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} className={toolbarButtonClass("neutral")}>
              <Redo2 size={14} />
              Redo
            </button>
            <button type="button" onClick={() => setPropertiesModalOpen(true)} className={toolbarButtonClass(hasSelection ? "accent" : "neutral")}>
              Properties
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
            <div
              ref={workspaceRef}
              className="relative h-full w-full overflow-hidden bg-slate-100 select-none"
              style={{ touchAction: "none" }}
              onMouseDown={handleWorkspaceMouseDown}
              onTouchStart={handleWorkspaceTouchStart}
              onTouchMove={handleWorkspaceTouchMove}
              onTouchEnd={handleWorkspaceTouchEnd}
              onTouchCancel={handleWorkspaceTouchEnd}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
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
                      <div className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br ${d.cls} px-2 py-1.5 text-white shadow-lg`}>
                        <div className="flex min-w-0 items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/90">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <ComponentGlyph type={component.type} compact />
                            <span className="truncate">{d.short}</span>
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] font-semibold leading-tight text-white">
                          {d.label}
                        </p>
                        <div className="mt-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                          {component.type === "switch" ? (
                            <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleSwitch(component.id); }} className={`inline-flex min-w-[2.75rem] items-center justify-center rounded-lg border px-2.5 py-1 text-base font-bold ${switchValue ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
                              {switchValue}
                            </button>
                          ) : null}
                          {component.type === "led" ? (
                            <span className={`inline-flex h-9 w-9 rounded-full border-2 ${ledValue ? "border-emerald-100 bg-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.85)]" : "border-slate-500 bg-slate-700"}`} />
                          ) : null}
                          {component.type !== "switch" && component.type !== "led" ? (
                            <div className="max-w-full truncate rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-[10px] font-medium leading-tight text-white/90">
                              {d.logic}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10px] leading-none text-white/80">
                          <span className="min-w-0 truncate">
                            {d.ins > 0 ? `In: ${inputValues.map((v) => bit(v)).join(" ")}` : "Ready"}
                          </span>
                          <span className="max-w-[3.9rem] truncate text-[9px] text-white/65">
                            {component.id}
                          </span>
                        </div>
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

      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={loadJson} />

      {propertiesModalOpen ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="A3cad properties"
        >
          <button
            type="button"
            aria-label="Close properties"
            onClick={() => setPropertiesModalOpen(false)}
            className="ui-modal__scrim"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-xl p-4 sm:p-5">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">A3cad</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Properties</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Inspect the selected component or wire without shrinking the workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPropertiesModalOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <X size={13} />
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {propertiesModalContent}
            </div>
          </div>
        </div>
      ) : null}

      {componentLibraryOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-slate-950/35 px-3 pb-3 pt-16 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="A3cad component library"
        >
          <button
            type="button"
            aria-label="Close component library"
            onClick={() => setComponentLibraryOpen(false)}
            className="absolute inset-0"
            tabIndex={-1}
          />
          <div className="relative z-10 max-h-[78vh] w-full overflow-hidden rounded-[26px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-[0_-18px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">A3cad</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Component Library</h3>
                <p className="mt-1 text-xs text-slate-500">Tap a component to place it in the workspace center.</p>
              </div>
              <button
                type="button"
                onClick={() => setComponentLibraryOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <X size={13} />
                Close
              </button>
            </div>
            <div className="max-h-[calc(78vh-5.5rem)] overflow-y-auto px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  setComponentLibraryOpen(false);
                  setGateGuideOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <Info size={13} />
                Gate Guide
              </button>
              {renderLibraryCards(true, "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2")}
              {shortcutsPanel}
            </div>
          </div>
        </div>
      ) : null}

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

