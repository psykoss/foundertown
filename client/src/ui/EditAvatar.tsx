/**
 * Edit Avatar dialog: categories on the left, items + colors in the middle, live preview on the right.
 * Edits a draft; the preview and every thumbnail use the SAME compositor as the game.
 */
import { useMemo, useState } from "react";
import { Dices, Download, Lock, X } from "lucide-react";
import {
  OPTIONAL_SLOTS, SKIN_RAMPS, avatarKey, randomAvatar, rampLibraryFor, sanitizeAvatar,
  type Avatar, type Dir, type ItemDef, type Slot,
} from "@ft/shared";
import { persistAvatar, store, useStore } from "../state/store";
import { AvatarSprite, CROP, avatarPng, type Crop } from "./AvatarSprite";

interface Category {
  id: string;
  label: string;
  /** Slot whose items fill the grid. */
  slot: Slot;
  /** Part of the character shown in this category's icon and item tiles. */
  crop: Crop;
  tileScale: number;
}

const CATEGORIES: Category[] = [
  { id: "skin", label: "Skin", slot: "face", crop: CROP.head, tileScale: 3 },
  { id: "hair", label: "Hair", slot: "hair", crop: CROP.head, tileScale: 3 },
  { id: "top", label: "Top", slot: "top", crop: CROP.torso, tileScale: 3 },
  { id: "jacket", label: "Jacket", slot: "outerwear", crop: CROP.torso, tileScale: 3 },
  { id: "bottom", label: "Bottom", slot: "bottom", crop: CROP.legs, tileScale: 4 },
  { id: "shoes", label: "Shoes", slot: "shoes", crop: CROP.legs, tileScale: 4 },
  { id: "hat", label: "Hat", slot: "headwear", crop: CROP.head, tileScale: 3 },
  { id: "glasses", label: "Glasses", slot: "face_accessory", crop: CROP.head, tileScale: 3 },
  { id: "other", label: "Other", slot: "back_accessory", crop: CROP.full, tileScale: 2 },
];
const DIRS: Dir[] = ["down", "left", "up", "right"];

/** Skin's main fill is its lightest shade; cloth and hair use the one below. */
const swatchColor = (ramp: readonly string[], skin: boolean) => (skin ? ramp[3] : ramp[2]);

export function EditAvatar() {
  const registry = useStore((s) => s.registry)!;
  const saved = useStore((s) => s.avatar);
  const name = useStore((s) => s.playerName);
  const [draft, setDraft] = useState<Avatar>(() => sanitizeAvatar(saved, registry));
  const [catId, setCatId] = useState("skin");
  const [dir, setDir] = useState<Dir>("down");

  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const slot = cat.slot;
  const isSkin = cat.id === "skin";
  const items = useMemo(() => registry.items.filter((i) => i.slot === slot), [registry, slot]);
  const choice = draft.slots[slot] ?? null;
  const item = choice ? registry.items.find((i) => i.id === choice.id) : undefined;
  const optional = OPTIONAL_SLOTS.includes(slot);
  const dirty = avatarKey(draft) !== avatarKey(sanitizeAvatar(saved, registry));

  const setSlot = (patch: Partial<Avatar["slots"]>) => setDraft((d) => ({ ...d, slots: { ...d.slots, ...patch } }));

  /** The draft wearing `it` in the current slot (keeps the colors already chosen for that slot). */
  const wearing = (it: ItemDef): Avatar => {
    const lib = Object.keys(rampLibraryFor(slot));
    return {
      ...draft,
      slots: {
        ...draft.slots,
        [slot]: {
          id: it.id,
          primary: it.channels.includes("primary") ? (choice?.primary ?? lib[0]) : undefined,
          secondary: it.channels.includes("secondary") ? (choice?.secondary ?? lib[1]) : undefined,
        },
      },
    };
  };

  const close = () => store.set((s) => ({ modal: s.avatarReturn, avatarReturn: null }));
  const done = () => {
    store.set({ avatar: draft });
    persistAvatar(draft);
    close();
  };
  const download = async () => {
    const a = document.createElement("a");
    a.href = await avatarPng(draft, registry);
    a.download = "avatar.png";
    a.click();
  };

  const colorRows: { key: string; label: string; ramps: Record<string, readonly string[]>; value: string | undefined; pick: (k: string) => void }[] = isSkin
    ? [{ key: "skin", label: "Skin tone", ramps: SKIN_RAMPS, value: draft.skin, pick: (k) => setDraft((d) => ({ ...d, skin: k })) }]
    : (item?.channels ?? [])
        .filter((c): c is "primary" | "secondary" => c !== "skin")
        .map((ch) => ({
          key: ch,
          label: ch === "primary" ? "Color" : "Accent color",
          ramps: rampLibraryFor(slot),
          value: choice?.[ch],
          pick: (k: string) => choice && setSlot({ [slot]: { ...choice, [ch]: k } }),
        }));

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog edit-avatar" role="dialog" aria-label="Edit Avatar">
        <header className="dialog-head">
          <h2>Edit Avatar</h2>
          <button className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>
        </header>

        <div className="avatar-body">
          <nav className="avatar-cats">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={"cat" + (c.id === catId ? " on" : "")} aria-pressed={c.id === catId} onClick={() => setCatId(c.id)}>
                <span className="cat-icon"><AvatarSprite avatar={draft} crop={c.crop === CROP.full ? CROP.torso : c.crop} scale={1} /></span>
                {c.label}
              </button>
            ))}
          </nav>

          <div className="avatar-pick">
            <div className="avatar-grid">
              {items.map((it) => {
                const on = choice?.id === it.id;
                return (
                  <div key={it.id} className="tile-wrap">
                    <button
                      className={"tile" + (on ? " on" : "")}
                      disabled={!!it.unlock}
                      aria-pressed={on}
                      title={it.unlock ? `${it.name} — locked` : it.name}
                      onClick={() => setDraft(wearing(it))}
                    >
                      <AvatarSprite avatar={wearing(it)} crop={cat.crop} scale={cat.tileScale} />
                      {it.unlock && <span className="tile-lock"><Lock size={14} /></span>}
                    </button>
                    {on && optional && (
                      <button className="tile-remove" aria-label={`Remove ${it.name}`} onClick={() => setSlot({ [slot]: null })}><X size={14} strokeWidth={2.5} /></button>
                    )}
                  </div>
                );
              })}
              {!items.length && <p className="empty">Nothing here yet.</p>}
            </div>
            {colorRows.map((row) => (
              <div key={row.key} className="avatar-colors" role="group" aria-label={row.label}>
                {Object.entries(row.ramps).map(([k, ramp]) => (
                  <button key={k} title={k} aria-label={k} aria-pressed={row.value === k} className={"dot" + (row.value === k ? " on" : "")} style={{ background: swatchColor(ramp, isSkin) }} onClick={() => row.pick(k)} />
                ))}
              </div>
            ))}
          </div>

          <div className="avatar-stage">
            <button className="icon-btn stage-btn top" aria-label="Download avatar" onClick={() => void download()}><Download size={18} /></button>
            <button className="stage-char" aria-label="Turn avatar" title="Click to turn" onClick={() => setDir(DIRS[(DIRS.indexOf(dir) + 1) % 4]!)}>
              <span className="nametag static"><span className="nametag-dot" />{name}</span>
              <AvatarSprite avatar={draft} crop={CROP.stage} scale={3} dir={dir} animate />
            </button>
            <button className="icon-btn stage-btn bottom" aria-label="Randomize avatar" onClick={() => setDraft(randomAvatar(registry))}><Dices size={18} /></button>
          </div>
        </div>

        <footer className="dialog-foot">
          <button className="btn outline" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={!dirty} onClick={done}>Done</button>
        </footer>
      </div>
    </div>
  );
}
