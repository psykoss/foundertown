/**
 * The studio: the owner editing their office. Pure editing logic over the store — the scene feeds
 * it pointer positions in world pixels (`game/input/StudioInput.ts`), the React panel calls the
 * rest. It never touches Phaser or the network: a finished edit is a new `store.office`, which the
 * world scene redraws and the net layer sends and saves.
 *
 * While something is in hand (a department being placed, a space being moved or resized) the
 * result is shown through `studio.preview`; it becomes the office only when dropped where it fits.
 */
import { MAIN_LOBBY, TILE, department, keepInside, resizeSpace, spaceAt, spaceFits, type Handle, type Space } from "@ft/shared";
import { store, STUDIO_IDLE, type Studio } from "./store";

/** Id of the space being placed until it is dropped. */
const GHOST = "new";
const UNDO_STEPS = 50;

type Drag =
  | { kind: "move"; id: string; grabX: number; grabY: number }
  | { kind: "resize"; id: string; handle: Handle };
let drag: Drag | null = null;

const patch = (p: Partial<Studio>) => store.set((s) => ({ studio: { ...s.studio, ...p } }));
const tileOf = (wx: number, wy: number) => ({ x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) });
const newId = () => Math.random().toString(36).slice(2, 10).padEnd(4, "0");
const sameRect = (a: Space, b: Space) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Can this account edit the office it is standing in? */
export function canEditOffice(): boolean {
  const s = store.get();
  return s.net.status === "online" && s.net.lobby !== MAIN_LOBBY && s.net.lobby === s.myLobby && !!s.build;
}

export function enterStudio() {
  if (!canEditOffice()) return void store.set({ notice: "Go to your own lobby to edit your office." });
  drag = null;
  store.set({ view: "studio", studio: STUDIO_IDLE, popover: null, modal: null });
}

export function exitStudio() {
  drag = null;
  store.set({ view: "map", studio: STUDIO_IDLE });
}

/** Choose what a click on the floor does: a department to place, "erase", or null to select and move. */
export function pickTool(tool: string | null) {
  drag = null;
  patch({ tool, selected: null, preview: null });
}

/** Show `space` in hand, in place of the one with its id (or as a new one). */
function show(space: Space) {
  const { office, build, studio } = store.get();
  if (!build) return;
  const current = studio.preview?.layout.spaces.find((s) => s.id === space.id);
  if (current && sameRect(current, space)) return;
  const others = office.spaces.filter((s) => s.id !== space.id);
  const spaces = office.spaces.some((s) => s.id === space.id) ? office.spaces.map((s) => (s.id === space.id ? space : s)) : [...office.spaces, space];
  patch({ preview: { layout: { spaces }, id: space.id, fits: spaceFits(others, space, build) } });
}

/** Make a finished edit the office, remembering the layout before it for undo. */
function commit(spaces: Space[], then: Partial<Studio> = {}) {
  store.set((s) => ({
    office: { spaces },
    studio: { ...s.studio, ...then, preview: null, undo: [...s.studio.undo, s.office].slice(-UNDO_STEPS), redo: [] },
  }));
}

/** Which edge or corner of `s` is within `slop` world px of the point? */
function handleAt(s: Space, wx: number, wy: number, slop: number): Handle | null {
  const left = s.x * TILE, top = s.y * TILE, right = (s.x + s.w) * TILE, bottom = (s.y + s.h) * TILE;
  if (wx < left - slop || wx > right + slop || wy < top - slop || wy > bottom + slop) return null;
  const v = Math.abs(wy - top) <= slop ? "n" : Math.abs(wy - bottom) <= slop ? "s" : "";
  const h = Math.abs(wx - left) <= slop ? "w" : Math.abs(wx - right) <= slop ? "e" : "";
  return (v + h || null) as Handle | null;
}

const RESIZE_CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/**
 * The pointer moved over the floor with no button down. With a department in hand it carries the
 * ghost; otherwise this only answers which cursor fits what is under it. `slop` = handle reach in world px.
 */
export function studioHover(wx: number, wy: number, slop: number): string {
  const { studio, office, build } = store.get();
  const t = tileOf(wx, wy);
  const dept = studio.tool ? department(studio.tool) : undefined;
  if (dept && build) {
    const { w, h } = dept.size;
    show(keepInside({ id: GHOST, kind: dept.id, x: t.x - Math.floor(w / 2), y: t.y - Math.floor(h / 2), w, h }, build));
    return "copy";
  }
  if (studio.tool === "erase") return spaceAt(office.spaces, t.x, t.y) ? "pointer" : "grab";
  const selected = office.spaces.find((s) => s.id === studio.selected);
  const handle = selected && handleAt(selected, wx, wy, slop);
  if (handle) return RESIZE_CURSOR[handle];
  return spaceAt(office.spaces, t.x, t.y) ? "move" : "grab";
}

/** The pointer left the floor: nothing is carried any more. */
export function studioLeave() {
  if (!drag && store.get().studio.preview) patch({ preview: null });
}

/**
 * Button down on the floor. Returns false when the press landed on nothing — the scene then pans
 * the camera with the drag.
 */
export function studioDown(wx: number, wy: number, slop: number): boolean {
  const { studio, office } = store.get();
  const t = tileOf(wx, wy);

  if (studio.tool && department(studio.tool)) {
    studioHover(wx, wy, slop);
    const preview = store.get().studio.preview;
    const ghost = preview?.layout.spaces.find((s) => s.id === GHOST);
    if (!preview || !ghost) return true;
    if (!preview.fits) return store.set({ notice: "That spot is taken — spaces can't overlap." }), true;
    const id = newId();
    commit(preview.layout.spaces.map((s) => (s === ghost ? { ...ghost, id } : s)), { tool: null, selected: id });
    return true;
  }

  const hit = spaceAt(office.spaces, t.x, t.y);
  if (studio.tool === "erase") {
    if (!hit) return false;
    removeSpace(hit.id);
    return true;
  }

  const selected = office.spaces.find((s) => s.id === studio.selected);
  const handle = selected && handleAt(selected, wx, wy, slop);
  if (selected && handle) {
    drag = { kind: "resize", id: selected.id, handle };
    return true;
  }
  if (hit) {
    drag = { kind: "move", id: hit.id, grabX: t.x - hit.x, grabY: t.y - hit.y };
    if (studio.selected !== hit.id) patch({ selected: hit.id });
    return true;
  }
  if (studio.selected) patch({ selected: null });
  return false;
}

/** The pointer moved with the button down on a space: carry it, or stretch it, tile by tile. */
export function studioMove(wx: number, wy: number) {
  const { office, build } = store.get();
  const origin = drag && office.spaces.find((s) => s.id === drag!.id);
  if (!drag || !origin || !build) return;
  const t = tileOf(wx, wy);
  if (drag.kind === "move") show(keepInside({ ...origin, x: t.x - drag.grabX, y: t.y - drag.grabY }, build));
  else {
    // an edge follows the tile boundary nearest the pointer
    const e = { x: Math.round(wx / TILE), y: Math.round(wy / TILE) };
    const tx = drag.handle.includes("e") ? e.x - 1 : e.x;
    const ty = drag.handle.includes("s") ? e.y - 1 : e.y;
    show(resizeSpace(origin, drag.handle, tx, ty, build));
  }
}

/** Button released: what is in hand stays where it is if it fits there, and goes back if not. */
export function studioUp() {
  if (!drag) return;
  const { studio, office } = store.get();
  const id = drag.id;
  drag = null;
  const preview = studio.preview;
  if (!preview) return;
  const moved = preview.layout.spaces.find((s) => s.id === id);
  const origin = office.spaces.find((s) => s.id === id);
  if (!moved || !origin || sameRect(moved, origin)) return patch({ preview: null });
  if (!preview.fits) {
    patch({ preview: null });
    return store.set({ notice: "It doesn't fit there — spaces can't overlap." });
  }
  commit(preview.layout.spaces);
}

export function removeSpace(id: string) {
  const { office, studio } = store.get();
  if (!office.spaces.some((s) => s.id === id)) return;
  drag = null;
  commit(office.spaces.filter((s) => s.id !== id), { selected: studio.selected === id ? null : studio.selected });
}

export function removeSelected() {
  const id = store.get().studio.selected;
  if (id) removeSpace(id);
}

/** Step back (or forward again) through the edits of this studio session. */
function travel(from: "undo" | "redo") {
  const to = from === "undo" ? "redo" : "undo";
  store.set((s) => {
    const stack = s.studio[from];
    const layout = stack.at(-1);
    if (!layout) return {};
    drag = null;
    const selected = layout.spaces.some((sp) => sp.id === s.studio.selected) ? s.studio.selected : null;
    return { office: layout, studio: { ...s.studio, selected, preview: null, [from]: stack.slice(0, -1), [to]: [...s.studio[to], s.office] } };
  });
}
export const undo = () => travel("undo");
export const redo = () => travel("redo");

/** Escape: let go of what is in hand, then the tool, then the selection. False = there was nothing to cancel. */
export function studioCancel(): boolean {
  const { studio } = store.get();
  if (drag) {
    drag = null;
    patch({ preview: null });
  } else if (studio.tool) patch({ tool: null, preview: null });
  else if (studio.selected) patch({ selected: null });
  else return false;
  return true;
}
