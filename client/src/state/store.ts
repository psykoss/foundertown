/**
 * Single client-side state store. React UI and Phaser both read from it;
 * Phaser rendering never owns game state (see CLAUDE.md §Rules).
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_AVATAR, type Avatar, type ItemRegistry } from "@ft/shared";

export interface DebugFlags {
  grid: boolean;
  collision: boolean;
  depth: boolean;
}

export interface Hud {
  fps: number;
  tileX: number;
  tileY: number;
  zone: string | null;
  zoom: number;
}

export interface AppState {
  ready: boolean;
  registry: ItemRegistry | null;
  avatar: Avatar;
  playerName: string;
  builderOpen: boolean;
  debug: DebugFlags;
  hud: Hud;
}

type Listener = () => void;

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Subscribe to a derived value; fires only when it changes (by reference). */
    watch<S>(select: (s: T) => S, cb: (v: S, prev: S) => void) {
      let prev = select(state);
      return this.subscribe(() => {
        const v = select(state);
        if (v !== prev) {
          const p = prev;
          prev = v;
          cb(v, p);
        }
      });
    },
  };
}

const AVATAR_KEY = "ft.avatar.v1";
function loadAvatar(): Avatar {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (raw) return JSON.parse(raw) as Avatar;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_AVATAR;
}
export function persistAvatar(a: Avatar) {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

export const store = createStore<AppState>({
  ready: false,
  registry: null,
  avatar: loadAvatar(),
  playerName: "You",
  builderOpen: false,
  debug: { grid: false, collision: false, depth: false },
  hud: { fps: 0, tileX: 0, tileY: 0, zone: null, zoom: 1 },
});

export function useStore<S>(select: (s: AppState) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
