/**
 * Single client-side state store. React UI and Phaser both read from it;
 * Phaser rendering never owns game state (see CLAUDE.md §Rules).
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_AVATAR, MAIN_LOBBY, sanitizeMeetings, type Avatar, type Dir, type FounderProfile, type ItemRegistry, type Meeting } from "@ft/shared";

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
export type Popover = "menu" | "profile" | "player";
export type Modal = "editProfile" | "editAvatar" | "invite" | "founder" | "settings" | "meeting";
/** What fills the frame: the town, or the calendar page (the town keeps running under it). */
export type View = "map" | "calendar";

/** Preferences, kept on this device (`ft.settings.v1`). */
export interface Settings {
  /** Clock style everywhere a time is shown. */
  hour12: boolean;
  /** Calendar: first day of the week (0 = Sunday, 1 = Monday) and the length of a new meeting. */
  weekStart: 0 | 1;
  meetingMinutes: 30 | 60;
  /** Meeting reminders: 5 minutes before, at the start, and whether they make a sound. */
  remindSoon: boolean;
  remindStart: boolean;
  remindSound: boolean;
  /** Chosen devices ("" = the system default). */
  micId: string;
  camId: string;
  noiseSuppression: boolean;
  /** How loud other people are, 0–1. */
  volume: number;
  /** Show your own camera mirrored (only for you). */
  mirror: boolean;
}

/** Where the account is in its life cycle; the game starts at "ready". */
export interface Session {
  status: "loading" | "signedOut" | "recovery" | "onboarding" | "ready";
  userId: string | null;
  email: string | null;
}

/** Connection to the multiplayer room. */
export interface Net {
  status: "offline" | "connecting" | "online";
  /** Lobby code we are in or joining. */
  lobby: string;
  /** Display name of the lobby, from the server. */
  title: string;
}

/** Someone in the room (including yourself), as synced by the server. */
export interface RemotePlayer {
  id: string;
  name: string;
  avatar: Avatar;
  stage: string;
  building: string;
  goals: string[];
  x: number;
  y: number;
  dir: Dir;
  speaking: boolean;
  cam: boolean;
}

/** Video calls: `peers` are connected at any distance; one invite can be pending each way. */
export interface Calls {
  peers: string[];
  incoming: string | null;
  outgoing: string | null;
}

export interface AppState {
  ready: boolean;
  registry: ItemRegistry | null;
  avatar: Avatar;
  playerName: string;
  /** IANA time zone shown on the profile. */
  timeZone: string;
  /** Profile picture as a data URL (null = initial on a colored circle). */
  picture: string | null;
  session: Session;
  /** Onboarding answers (null until answered). */
  founder: FounderProfile | null;
  /** Code of your own private lobby. */
  myLobby: string;
  net: Net;
  /** Everyone in the room by session id; `selfId` is you. */
  players: Record<string, RemotePlayer>;
  selfId: string | null;
  /** Net → world intent: bump `n` to put the player on a tile (join, rejected move). */
  snap: { n: number; x: number; y: number };
  mic: boolean;
  cam: boolean;
  speaking: boolean;
  calls: Calls;
  /** Your camera, and the video of each connected peer (shown while their `cam` flag is on). */
  localVideo: MediaStream | null;
  videos: Record<string, MediaStream>;
  /** One-line message shown briefly at the top of the frame. */
  notice: string | null;
  popover: Popover | null;
  /** Player the "player" popover is about. */
  selected: string | null;
  modal: Modal | null;
  /** Where "Edit Avatar" returns to when closed. */
  avatarReturn: Modal | null;
  view: View;
  settings: Settings;
  /** Your meetings, sorted by start (kept on this device, `ft.meetings.v1`). */
  meetings: Meeting[];
  /** What the "meeting" dialog is about: an existing meeting, or a new one starting at `start`. */
  meetingEdit: { id: string } | { start: number } | null;
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

const SETTINGS_KEY = "ft.settings.v1";
const MEETINGS_KEY = "ft.meetings.v1";
function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
function loadSettings(): Settings {
  const defaults: Settings = {
    hour12: new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? true,
    weekStart: 0,
    meetingMinutes: 30,
    remindSoon: true,
    remindStart: true,
    remindSound: true,
    micId: "",
    camId: "",
    noiseSuppression: true,
    volume: 1,
    mirror: true,
  };
  const raw = readJson(SETTINGS_KEY) as Partial<Record<keyof Settings, unknown>> | null;
  if (!raw || typeof raw !== "object") return defaults;
  // keep only stored values of the right type, so an old or edited entry cannot break a control
  const out = { ...defaults } as Record<keyof Settings, unknown>;
  for (const k of Object.keys(defaults) as (keyof Settings)[]) if (typeof raw[k] === typeof defaults[k]) out[k] = raw[k];
  const s = out as unknown as Settings;
  return { ...s, weekStart: s.weekStart === 1 ? 1 : 0, meetingMinutes: s.meetingMinutes === 60 ? 60 : 30, volume: Math.min(1, Math.max(0, s.volume)) };
}

export const store = createStore<AppState>({
  ready: false,
  registry: null,
  avatar: loadAvatar(),
  playerName: profile.name,
  timeZone: profile.timeZone,
  picture: profile.picture,
  session: { status: "loading", userId: null, email: null },
  founder: null,
  myLobby: "",
  net: { status: "offline", lobby: MAIN_LOBBY, title: "" },
  players: {},
  selfId: null,
  snap: { n: 0, x: 0, y: 0 },
  mic: false,
  cam: false,
  speaking: false,
  calls: { peers: [], incoming: null, outgoing: null },
  localVideo: null,
  videos: {},
  notice: null,
  popover: null,
  selected: null,
  modal: null,
  avatarReturn: null,
  view: "map",
  settings: loadSettings(),
  meetings: sanitizeMeetings(readJson(MEETINGS_KEY)),
  meetingEdit: null,
  sidebarOpen: true,
  minimapOpen: true,
  minimap: null,
  zoomCmd: { n: 0, dir: 1 },
  debug: { grid: false, collision: false, depth: false },
  hud: { fps: 0, tileX: 0, tileY: 0, zone: null, zoom: 1 },
});

store.watch((s) => s.settings, (v) => writeJson(SETTINGS_KEY, v));
store.watch((s) => s.meetings, (v) => writeJson(MEETINGS_KEY, v));

export function useStore<S>(select: (s: AppState) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
