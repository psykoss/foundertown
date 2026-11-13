/**
 * The studio (logo menu → Edit the office, `/studio/<lobby>`): the owner lays out their office.
 * Left: a tool rail and the catalog of departments; the rest of the frame is the office itself,
 * edited on the canvas (`state/studio.ts` holds the logic, the scene draws it). Every change is
 * saved as it is made and seen at once by whoever is in the lobby.
 *
 * Also here: the chips that name each space in the world (`SpaceChips`) and the department icons.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Crown, Eraser, Hammer, Handshake, Landmark, Megaphone, Redo2, Rocket, Scale, Search, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { DEPARTMENTS, TILE, buildWorld, department, floorUsed, mapLibrary, type Department, type TiledMap } from "@ft/shared";
import { exitStudio, pickTool, redo, removeSelected, removeSpace, undo } from "../state/studio";
import { useStore } from "../state/store";

const A = `${import.meta.env.BASE_URL}assets/`;
const ICON = { size: 20, strokeWidth: 1.75 } as const;

/** One clean line icon per department (DEPARTMENTS id). */
const DEPT_ICONS: Record<string, LucideIcon> = { hq: Crown, product: Rocket, sales: Handshake, marketing: Megaphone, finance: Landmark, legal: Scale };

export function DeptIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const Icon = DEPT_ICONS[kind];
  return Icon ? <Icon size={size} strokeWidth={2} aria-hidden /> : null;
}

// ── chips over the world ───────────────────────────────────────────────────────

/**
 * A chip on every space of the office: its icon and name, centered just above the space. Rendered into
 * the scene's world layer (`game/render/WorldLayer.ts`), so the chips sit on the floor in world
 * pixels. In the studio the selected space's chip also shows its size and a remove button.
 */
export function SpaceChips() {
  const spaces = useStore((s) => s.studio.preview?.layout.spaces ?? s.office.spaces);
  const editing = useStore((s) => s.view === "studio");
  const selected = useStore((s) => s.studio.selected);
  const layer = useMemo(() => document.querySelector<HTMLElement>("#game .world-layer"), []);
  if (!layer) return null;
  return createPortal(
    spaces.map((s) => {
      const dept = department(s.kind);
      if (!dept) return null;
      const open = editing && selected === s.id;
      return (
        <div key={s.id} className={"space-chip" + (open ? " open" : "")} style={{ left: (s.x + s.w / 2) * TILE, top: s.y * TILE, "--c": dept.color } as CSSProperties}>
          <i><DeptIcon kind={dept.id} size={13} /></i>
          {dept.label}
          {open && <small>{s.w} × {s.h}</small>}
          {open && <button aria-label={`Remove ${dept.label}`} title="Remove (Delete)" onClick={() => removeSpace(s.id)}><Trash2 size={13} strokeWidth={2} /></button>}
        </div>
      );
    }),
    layer,
  );
}

// ── catalog thumbnails ─────────────────────────────────────────────────────────

interface Art {
  map: TiledMap;
  terrain: HTMLImageElement;
  /** Prop images by file name. */
  props: Map<string, HTMLImageElement>;
}
let art: Promise<Art> | null = null;

const image = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** The office map and the art it names (the same files the game has already loaded — these come from the browser cache). */
function loadArt(): Promise<Art> {
  return (art ??= (async () => {
    const mapUrl = new URL(`${A}maps/office.tmj`, location.href);
    const map = (await (await fetch(mapUrl)).json()) as TiledMap;
    const props = new Map<string, HTMLImageElement>();
    await Promise.all([...mapLibrary(map).props.values()].map(async (p) => void props.set(p.image, await image(new URL(p.path, mapUrl).href))));
    return { map, terrain: await image(`${A}tilesets/terrain.png`), props };
  })());
}

/** A department at its starting size, drawn from the game's own floor tile and furniture layout. */
function SpacePreview({ dept }: { dept: Department }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = dept.size;
  useEffect(() => {
    let alive = true;
    void loadArt().then(({ map, terrain, props }) => {
      const ctx = ref.current?.getContext("2d");
      if (!alive || !ctx) return;
      const world = buildWorld({ ...map, width: w, height: h, layers: [] }, { spaces: [{ id: "a", kind: dept.id, x: 0, y: 0, w, h }] });
      const ts = map.tilesets.find((t) => t.name === "terrain");
      const floor = (world.spaces[0]?.floor ?? 0) - (ts?.firstgid ?? 1);
      if (ts && floor >= 0)
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) ctx.drawImage(terrain, (floor % ts.columns) * TILE, Math.floor(floor / ts.columns) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      for (const f of [...world.furniture].sort((a, b) => a.y + a.z - (b.y + b.z))) {
        const img = props.get(f.image);
        if (img) ctx.drawImage(img, f.x, f.y - f.height);
      }
    }).catch(() => undefined);
    return () => void (alive = false);
  }, [dept, w, h]);
  return <canvas ref={ref} className="studio-thumb" width={w * TILE} height={h * TILE} />;
}

// ── the studio ─────────────────────────────────────────────────────────────────

function RailButton({ label, active, disabled, accent, onClick, children }: { label: string; active?: boolean; disabled?: boolean; accent?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={"side-btn" + (active ? " active" : "") + (accent ? " accent" : "")} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

export function Studio() {
  const studio = useStore((s) => s.studio);
  const office = useStore((s) => s.office);
  const build = useStore((s) => s.build);
  const save = useStore((s) => s.officeSave);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      else if (mod && key === "z") e.shiftKey ? redo() : undo();
      else if (mod && key === "y") redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = DEPARTMENTS.filter((d) => !q || `${d.label} ${d.hint} ${d.about}`.toLowerCase().includes(q));
  const picked = studio.tool ? department(studio.tool) : undefined;
  const selected = department(office.spaces.find((s) => s.id === studio.selected)?.kind ?? "");
  const about = picked ?? selected;
  const erasing = studio.tool === "erase";

  return (
    <aside className="studio" aria-label="Studio">
      <nav className="studio-rail">
        <RailButton label="Build" active={!erasing} onClick={() => erasing && pickTool(null)}><Hammer {...ICON} /></RailButton>
        <div className="side-sep" />
        <RailButton label="Undo (⌘Z)" disabled={!studio.undo.length} onClick={undo}><Undo2 {...ICON} /></RailButton>
        <RailButton label="Redo (⇧⌘Z)" disabled={!studio.redo.length} onClick={redo}><Redo2 {...ICON} /></RailButton>
        <div className="side-spacer" />
        <RailButton label="Eraser — click a space to remove it" active={erasing} onClick={() => pickTool(erasing ? null : "erase")}><Eraser {...ICON} /></RailButton>
        <RailButton label="Done — back to the office" accent onClick={exitStudio}><Check {...ICON} strokeWidth={2.25} /></RailButton>
      </nav>

      <div className="studio-panel">
        <h1>Studio</h1>
        <label className="cal-search">
          <Search size={18} strokeWidth={2} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search departments" aria-label="Search departments" />
        </label>
        <div className="studio-list">
          {shown.map((d) => (
            <button key={d.id} className={"studio-card" + (studio.tool === d.id ? " on" : "")} aria-pressed={studio.tool === d.id} onClick={() => pickTool(studio.tool === d.id ? null : d.id)}>
              <span className="studio-art"><SpacePreview dept={d} /></span>
              <b><span style={{ color: d.color }}><DeptIcon kind={d.id} size={15} /></span>{d.label}</b>
              <small>{d.hint}</small>
            </button>
          ))}
          {!shown.length && <p className="empty">No department matches “{query.trim()}”.</p>}
        </div>
        <p className="studio-about">
          {about ? <><b>{about.label}.</b> {about.about}</> : "Pick a department, then click the floor to place it. Spaces sit side by side — no walls between them."}
        </p>
        <div className="studio-foot">
          <span>Floor used: {Math.round(floorUsed(office, build) * 100)}%</span>
          <span className={"studio-save " + save}>{save === "saving" ? "Saving…" : save === "error" ? "Not saved" : "Saved"}</span>
        </div>
      </div>
    </aside>
  );
}

/** One line at the bottom of the frame: what the pointer does right now. */
export function StudioHint() {
  const tool = useStore((s) => s.studio.tool);
  const selected = useStore((s) => s.studio.selected);
  const empty = useStore((s) => s.office.spaces.length === 0);
  const dept = tool ? department(tool) : undefined;
  const text = dept ? `Click the floor to place ${dept.label} · Esc to cancel`
    : tool === "erase" ? "Click a space to remove it · Esc to stop"
    : selected ? "Drag to move · drag an edge or corner to resize · Delete to remove"
    : empty ? "Your office is empty — pick a department on the left to start"
    : "Click a space to select it · drag the floor to look around · scroll to zoom";
  return <div className="studio-hint" role="status">{text}</div>;
}
