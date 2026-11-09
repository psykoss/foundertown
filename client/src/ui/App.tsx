import { store, useStore } from "../state/store";
import { CharacterBuilder } from "./CharacterBuilder";

export function App() {
  const ready = useStore((s) => s.ready);
  const builderOpen = useStore((s) => s.builderOpen);
  const hud = useStore((s) => s.hud);
  const debug = useStore((s) => s.debug);
  const anyDebug = debug.grid || debug.collision || debug.depth;

  if (!ready) return <div className="loading">Loading Founder Town…</div>;

  return (
    <>
      <div className="hud-top">
        <span className="brand">Founder Town</span>
        {hud.zone && <span className="chip">{hud.zone.replace("_", " ")}</span>}
      </div>

      {anyDebug && (
        <div className="debug-panel">
          <div>fps {hud.fps}</div>
          <div>tile {hud.tileX},{hud.tileY}</div>
          <div>zoom {hud.zoom}×</div>
          <div className="muted">F1 grid · F2 collision · F3 depth</div>
        </div>
      )}

      <div className="dock">
        <button className="btn" onClick={() => store.set({ builderOpen: true })}>
          Avatar
        </button>
        <button
          className="btn ghost"
          onClick={() => store.set((s) => ({ debug: { grid: !anyDebug, collision: !anyDebug, depth: !anyDebug } }))}
        >
          Debug
        </button>
        <span className="hint">WASD / arrows or click to walk</span>
      </div>

      {builderOpen && <CharacterBuilder />}
    </>
  );
}
