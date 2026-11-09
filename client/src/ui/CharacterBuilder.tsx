/**
 * Layered character builder. Edits a draft avatar; preview uses the SAME compositor as the game.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANIMS, FRAME_H, FRAME_W, OPTIONAL_SLOTS, SKIN_RAMPS, SLOTS, rampLibraryFor, sanitizeAvatar, sheetDirFor, sheetFrame, SHEET_COLS,
  type AnimName, type Avatar, type Dir, type ItemDef, type Slot,
} from "@ft/shared";
import { persistAvatar, store, useStore } from "../state/store";
import { bakeAvatar } from "../game/avatar/compositor";

const SLOT_LABEL: Record<Slot, string> = {
  body: "Body", face: "Face", hair: "Hair", top: "Top", outerwear: "Outerwear", bottom: "Bottom",
  shoes: "Shoes", headwear: "Headwear", face_accessory: "Glasses", back_accessory: "Back",
};
const EDITABLE: Slot[] = SLOTS.filter((s) => s !== "body" && s !== "face");
const DIR_CYCLE: Dir[] = ["down", "left", "up", "right"];

export function CharacterBuilder() {
  const registry = useStore((s) => s.registry)!;
  const saved = useStore((s) => s.avatar);
  const name = useStore((s) => s.playerName);
  const [draft, setDraft] = useState<Avatar>(() => sanitizeAvatar(saved, registry));
  const [slot, setSlot] = useState<Slot>("hair");
  const [dir, setDir] = useState<Dir>("down");
  const [anim, setAnim] = useState<AnimName>("idle");

  const items = useMemo(() => registry.items.filter((i) => i.slot === slot), [registry, slot]);
  const choice = draft.slots[slot] ?? null;
  const item = choice ? registry.items.find((i) => i.id === choice.id) : undefined;

  const update = (patch: Partial<Avatar["slots"]>) => setDraft((d) => ({ ...d, slots: { ...d.slots, ...patch } }));

  const pickItem = (it: ItemDef | null) => {
    if (!it) return update({ [slot]: null });
    const lib = Object.keys(rampLibraryFor(slot));
    update({
      [slot]: {
        id: it.id,
        primary: it.channels.includes("primary") ? (choice?.primary ?? lib[0]) : undefined,
        secondary: it.channels.includes("secondary") ? (choice?.secondary ?? lib[1]) : undefined,
      },
    });
  };

  const save = () => {
    store.set({ avatar: draft, builderOpen: false });
    persistAvatar(draft);
  };

  return (
    <div className="builder-backdrop" onMouseDown={(e) => e.target === e.currentTarget && store.set({ builderOpen: false })}>
      <div className="builder">
        <div className="builder-preview">
          <Preview avatar={draft} dir={dir} anim={anim} />
          <div className="row">
            <button className="btn small ghost" onClick={() => setDir(DIR_CYCLE[(DIR_CYCLE.indexOf(dir) + 3) % 4]!)}>⟲</button>
            <button className="btn small ghost" onClick={() => setAnim(anim === "idle" ? "walk" : "idle")}>{anim}</button>
            <button className="btn small ghost" onClick={() => setDir(DIR_CYCLE[(DIR_CYCLE.indexOf(dir) + 1) % 4]!)}>⟳</button>
          </div>
          <input className="name" value={name} maxLength={20} onChange={(e) => store.set({ playerName: e.target.value })} />
          <div className="label">Skin</div>
          <div className="swatches">
            {Object.entries(SKIN_RAMPS).map(([k, ramp]) => (
              <button key={k} title={k} className={"swatch" + (draft.skin === k ? " on" : "")} style={{ background: `linear-gradient(${ramp[3]} 60%, ${ramp[2]} 60%)` }}
                onClick={() => setDraft((d) => ({ ...d, skin: k }))} />
            ))}
          </div>
        </div>

        <div className="builder-side">
          <div className="tabs">
            {EDITABLE.map((s) => (
              <button key={s} className={"tab" + (s === slot ? " on" : "")} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}</button>
            ))}
          </div>

          <div className="items">
            {OPTIONAL_SLOTS.includes(slot) && (
              <button className={"item" + (!choice ? " on" : "")} onClick={() => pickItem(null)}>None</button>
            )}
            {items.map((it) => (
              <button key={it.id} disabled={!!it.unlock} title={it.unlock ? `Unlock: ${it.unlock}` : it.name}
                className={"item" + (choice?.id === it.id ? " on" : "") + (it.unlock ? " locked" : "")} onClick={() => pickItem(it)}>
                {it.name}{it.unlock ? " 🔒" : ""}
              </button>
            ))}
          </div>

          {item?.channels.filter((c): c is "primary" | "secondary" => c !== "skin").map((ch) => (
            <div key={ch}>
              <div className="label">{ch === "primary" ? "Color" : "Accent"}</div>
              <div className="swatches">
                {Object.entries(rampLibraryFor(slot)).map(([k, ramp]) => (
                  <button key={k} title={k} className={"swatch" + (choice?.[ch] === k ? " on" : "")} style={{ background: `linear-gradient(${ramp[3]} 60%, ${ramp[2]} 60%)` }}
                    onClick={() => choice && update({ [slot]: { ...choice, [ch]: k } })} />
                ))}
              </div>
            </div>
          ))}

          <div className="row end">
            <button className="btn ghost" onClick={() => store.set({ builderOpen: false })}>Cancel</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SCALE = 5;

function Preview({ avatar, dir, anim }: { avatar: Avatar; dir: Dir; anim: AnimName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const registry = useStore((s) => s.registry)!;

  useEffect(() => {
    let sheet: HTMLCanvasElement | null = null;
    let raf = 0;
    let alive = true;
    bakeAvatar(avatar, registry).then((s) => alive && (sheet = s));
    const { sheetDir, flipX } = sheetDirFor(dir);
    const start = performance.now();
    const draw = (t: number) => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (c && ctx && sheet) {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        const f = Math.floor(((t - start) / 1000) * ANIMS[anim].fps) % ANIMS[anim].frames;
        const idx = sheetFrame(anim, sheetDir, f);
        const sx = (idx % SHEET_COLS) * FRAME_W;
        const sy = Math.floor(idx / SHEET_COLS) * FRAME_H;
        ctx.save();
        if (flipX) {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W * SCALE, FRAME_H * SCALE);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [avatar, dir, anim, registry]);

  return <canvas ref={ref} className="preview" width={FRAME_W * SCALE} height={FRAME_H * SCALE} />;
}
