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

/** Floor plan for the minimap, in tile units. Published once by the world scene. */
export interface Minimap {
  width: number;
  height: number;
  /** Solid wall tiles, row-major (1 = wall). */
  walls: Uint8Array;
  /** Thin walls on the west / north edge of a tile. */
  edges: { x: number; y: number; side: "W" | "N" }[];
  /** Floor area taken by each piece of furniture. */
  furniture: { x: number; y: number; w: number; h: number }[];
}

/** Small anchored panels (one at a time) and blocking dialogs. */
export type Popover = "menu" | "profile";
export type Modal = "editProfile" | "editAvatar";

export interface AppState {
  ready: boolean;
  registry: ItemRegistry | null;
  avatar: Avatar;
  playerName: string;
  /** IANA time zone shown on the profile. */
  timeZone: string;
  /** Profile picture as a data URL (null = initial on a colored circle). */
  picture: string | null;
  popover: Popover | null;
  modal: Modal | null;
  /** Where "Edit Avatar" returns to when closed. */
  avatarReturn: Modal | null;
  sidebarOpen: boolean;
  minimapOpen: boolean;
  minimap: Minimap | null;
  /** UI → camera intent: bump `n` to step the zoom one level in `dir`. */
  zoomCmd: { n: number; dir: 1 | -1 };
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

interface Profile {
  name: string;
  timeZone: string;
  picture: string | null;
}
const PROFILE_KEY = "ft.profile.v1";
function loadProfile(): Profile {
  const fallback: Profile = { name: "You", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", picture: null };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* storage unavailable */
  }
  return fallback;
}
export function persistProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable or picture too large */
  }
}
const profile = loadProfile();

export const store = createStore<AppState>({
  ready: false,
  registry: null,
  avatar: loadAvatar(),
  playerName: profile.name,
  timeZone: profile.timeZone,
  picture: profile.picture,
  popover: null,
  modal: null,
  avatarReturn: null,
  sidebarOpen: true,
  minimapOpen: true,
  minimap: null,
  zoomCmd: { n: 0, dir: 1 },
  debug: { grid: false, collision: false, depth: false },
  hud: { fps: 0, tileX: 0, tileY: 0, zone: null, zoom: 1 },
});

export function useStore<S>(select: (s: AppState) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
