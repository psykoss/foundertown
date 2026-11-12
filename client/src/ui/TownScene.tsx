/**
 * A slice of the office drawn from the game's own art (terrain tiles, plant prop, the avatar
 * compositor) at a whole-number scale — the backdrop of full-screen steps such as onboarding.
 * Layout is CSS in tile units (`--t` = one tile in px, `--k` = the scale); see `.scene*` in styles.css.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { TILE, type Avatar, type ItemRegistry } from "@ft/shared";
import { store, useStore } from "../state/store";
import { AvatarSprite, CROP } from "./AvatarSprite";

const A = `${import.meta.env.BASE_URL}assets/`;
/** Terrain tileset: 8 columns of 32px tiles (indices from `scripts/lib/env.ts`). */
const COLS = 8;
const T = { floor: 4, carpet: 5, faceTop: 17, faceTopWindow: 18, faceBottom: 19 } as const;
/** Plant prop width in art pixels. */
const PLANT_W = 36;

interface SceneArt {
  wall: string;
  floor: string;
  carpet: string;
}
let art: Promise<SceneArt> | null = null;

/** Cut the scene's tiles out of the tileset once, as data URLs CSS can repeat. */
function loadArt(): Promise<SceneArt> {
  return (art ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const strip = (rows: number[][]) => {
        const c = document.createElement("canvas");
        c.width = rows[0]!.length * TILE;
        c.height = rows.length * TILE;
        const ctx = c.getContext("2d")!;
        rows.forEach((row, y) => row.forEach((t, x) => ctx.drawImage(img, (t % COLS) * TILE, Math.floor(t / COLS) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE)));
        return `url(${c.toDataURL()})`;
      };
      resolve({
        // back wall, two tiles high, a window every fourth tile
        wall: strip([[T.faceTop, T.faceTopWindow, T.faceTop, T.faceTop], [T.faceBottom, T.faceBottom, T.faceBottom, T.faceBottom]]),
        floor: strip([[T.floor]]),
        carpet: strip([[T.carpet]]),
      });
    };
    img.onerror = reject;
    img.src = `${A}tilesets/terrain.png`;
  }));
}

/** World scale: 3 screen px per art px on roomy screens, 2 otherwise. */
function useScale(): number {
  const pick = () => (window.innerHeight >= 820 && window.innerWidth >= 1100 ? 3 : 2);
  const [k, setK] = useState(pick);
  useEffect(() => {
    const on = () => setK(pick());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return k;
}

/** `children` float above the character's name tag. */
export function TownScene({ avatar, name, children }: { avatar: Avatar; name: string; children?: ReactNode }) {
  const registry = useStore((s) => s.registry);
  const [tiles, setTiles] = useState<SceneArt | null>(null);
  const k = useScale();

  useEffect(() => {
    let alive = true;
    loadArt().then((a) => alive && setTiles(a)).catch(() => undefined);
    // Before the game has booted nobody has loaded the item registry the avatar is composed from.
    if (!store.get().registry)
      fetch(`${A}characters/items.json`).then((r) => r.json()).then((items: ItemRegistry) => store.get().registry || store.set({ registry: items })).catch(() => undefined);
    return () => void (alive = false);
  }, []);

  return (
    <div className="scene" style={{ "--t": `${TILE * k}px`, "--k": k } as CSSProperties}>
      {tiles && (
        <>
          <div className="scene-wall" style={{ backgroundImage: tiles.wall }} />
          <div className="scene-floor" style={{ backgroundImage: tiles.floor }} />
          <div className="scene-rug" style={{ backgroundImage: tiles.carpet }} />
          <img className="scene-plant left" src={`${A}furniture/office/plant_tree.png`} width={PLANT_W * k} alt="" />
          <img className="scene-plant right" src={`${A}furniture/office/plant_tree.png`} width={PLANT_W * k} alt="" />
        </>
      )}
      <div className="scene-me">
        {children}
        <span className="nametag static"><span className="nametag-dot" />{name}</span>
        {registry && <AvatarSprite avatar={avatar} crop={CROP.stage} scale={k} animate />}
      </div>
    </div>
  );
}
