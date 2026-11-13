/**
 * Connection to the multiplayer room. Mirrors the room state into the store (`players`, `net`) and
 * sends the player's intents; nothing here knows about Phaser or React.
 * A lost connection is retried in place; a lobby that refuses us falls back to the main lobby.
 *
 * The office layout travels the same way: the room state carries it to everyone (`store.office`),
 * and when the owner changes it in the store it is sent to the room and saved (`office.ts`).
 */
import { Client, type Room } from "@colyseus/sdk";
import {
  EMPTY_FOUNDER, EMPTY_OFFICE, MAIN_LOBBY, MSG, ROOM, isLobby,
  type Avatar, type CallKind, type Dir, type JoinOptions, type MediaMsg, type MoveMsg, type OfficeLayout, type PlayerState, type ProfileMsg, type Relay, type RtcData, type SnapMsg,
} from "@ft/shared";
import { lobbyCodeFromUrl, PLAY_PATH } from "../router";
import { guestOffice, saveOffice } from "./office";
import { store, type RemotePlayer } from "../state/store";
import { SERVER_URL } from "./config";
import { getToken } from "./session";

const RETRY_MS = 3000;

const client = new Client(SERVER_URL);
let room: Room | null = null;
/** Bumped by every join; an older join that resolves late sees it changed and backs out. */
let generation = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
/** Avatar JSON last parsed per player, so an unchanged avatar keeps its object identity. */
const avatarJson = new Map<string, string>();
/** Office layout as the room last sent it (JSON, and the object put in the store). Any other `store.office` is the owner's own edit. */
let officeJson = "";
let roomOffice: OfficeLayout = EMPTY_OFFICE;

/** Are we in our own lobby — the one whose office we may edit? */
export function ownsLobby(): boolean {
  const s = store.get();
  return s.net.lobby !== MAIN_LOBBY && s.net.lobby === s.myLobby;
}
/** While the owner is in the studio their layout is the newest there is; the room only echoes it back. */
const editing = () => store.get().view === "studio" && ownsLobby();

function takeRoomOffice() {
  let layout: OfficeLayout = EMPTY_OFFICE;
  try {
    layout = JSON.parse(officeJson) as OfficeLayout;
  } catch {
    /* not sent yet */
  }
  if (!Array.isArray(layout?.spaces)) layout = EMPTY_OFFICE;
  if (JSON.stringify(store.get().office) === JSON.stringify(layout)) return void (roomOffice = store.get().office);
  roomOffice = layout;
  store.set({ office: layout });
}

type RelayHandler<T> = (from: string, data: T) => void;
const rtcHandlers = new Set<RelayHandler<RtcData>>();
const callHandlers = new Set<RelayHandler<CallKind>>();

/** Lobby named by the page URL (`/play/<code>` or `?lobby=<code>`), else the main lobby. */
export function lobbyFromUrl(): string {
  const code = lobbyCodeFromUrl();
  return isLobby(code) ? code : MAIN_LOBBY;
}

/** Shareable link to a lobby: `/play` (main) or `/play/<code>`. */
export function lobbyUrl(lobby: string): string {
  return location.origin + PLAY_PATH + (lobby === MAIN_LOBBY ? "" : `/${lobby}`);
}

function profile(): ProfileMsg {
  const s = store.get();
  return { name: s.playerName, avatar: s.avatar, founder: s.founder ?? EMPTY_FOUNDER };
}

function snap(at: { x: number; y: number }) {
  store.set((s) => ({ snap: { n: s.snap.n + 1, x: at.x, y: at.y } }));
}

/** Copy the room state into the store, reusing the objects of players that did not change. */
function sync(state: { title: string; office: string; players: { forEach(cb: (p: PlayerState, id: string) => void): void } }) {
  if (state.office !== officeJson) {
    const first = !officeJson;
    officeJson = state.office;
    if (first || !editing()) takeRoomOffice();
  }
  const s = store.get();
  const next: Record<string, RemotePlayer> = {};
  let changed = false;
  let count = 0;
  state.players.forEach((p, id) => {
    count++;
    const old = s.players[id];
    const same = old && avatarJson.get(id) === p.avatar && old.name === p.name && old.stage === p.stage && old.building === p.building
      && old.goals.join(",") === p.goals && old.x === p.x && old.y === p.y && old.dir === p.dir && old.speaking === p.speaking && old.cam === p.cam;
    if (same) return void (next[id] = old);
    changed = true;
    const avatar = old && avatarJson.get(id) === p.avatar ? old.avatar : (JSON.parse(p.avatar) as Avatar);
    avatarJson.set(id, p.avatar);
    next[id] = {
      id, avatar, name: p.name, stage: p.stage, building: p.building, goals: p.goals ? p.goals.split(",") : [],
      x: p.x, y: p.y, dir: p.dir as Dir, speaking: p.speaking, cam: p.cam,
    };
  });
  if (changed || count !== Object.keys(s.players).length) store.set({ players: next });
  if (state.title !== s.net.title) store.set((cur) => ({ net: { ...cur.net, title: state.title } }));
}

/** Leave the current lobby (if any) and enter `lobby`. `at` = tile to stand on when rejoining after a drop. */
export async function joinLobby(lobby: string, at?: { x: number; y: number }): Promise<void> {
  const gen = ++generation;
  clearTimeout(retryTimer);
  const previous = room;
  room = null;
  void previous?.leave();
  avatarJson.clear();
  officeJson = "";
  roomOffice = EMPTY_OFFICE;
  // the studio edits the lobby we are in: leaving the lobby leaves the studio
  store.set((s) => ({ net: { status: "connecting", lobby, title: "" }, players: {}, selfId: null, office: EMPTY_OFFICE, view: s.view === "studio" && lobby !== s.net.lobby ? "map" : s.view }));

  let r: Room;
  try {
    const office = lobby === store.get().myLobby ? guestOffice() : undefined;
    r = await client.joinOrCreate(ROOM, { lobby, token: await getToken(), ...profile(), at, office } satisfies JoinOptions);
  } catch (e) {
    if (gen !== generation) return;
    // A numeric code means the server answered and said no (bad lobby, not signed in); anything else is the network.
    if (typeof (e as { code?: unknown }).code === "number" && lobby !== MAIN_LOBBY) {
      store.set({ notice: (e as Error).message || "Could not join that lobby." });
      return joinLobby(MAIN_LOBBY);
    }
    store.set({ net: { status: "offline", lobby, title: "" } });
    retryTimer = setTimeout(() => void joinLobby(lobby, at), RETRY_MS);
    return;
  }
  if (gen !== generation) return void r.leave();

  room = r;
  r.reconnection.enabled = false; // a drop ends this room; we rejoin below with a fresh session
  store.set((s) => ({ net: { ...s.net, status: "online" }, selfId: r.sessionId }));
  let placed = false;
  r.onStateChange((state) => {
    if (room !== r) return;
    sync(state);
    const me = store.get().players[r.sessionId];
    if (me && !placed) {
      placed = true;
      snap(me); // the server decided where we stand
    }
  });
  r.onMessage(MSG.snap, (m: SnapMsg) => snap(m));
  r.onMessage(MSG.rtc, (m: Relay<RtcData>) => m.from && rtcHandlers.forEach((h) => h(m.from!, m.data)));
  r.onMessage(MSG.call, (m: Relay<CallKind>) => m.from && callHandlers.forEach((h) => h(m.from!, m.data)));
  r.onLeave(() => {
    if (room !== r) return; // we left on purpose
    room = null;
    const me = store.get().players[r.sessionId];
    store.set({ net: { status: "offline", lobby, title: "" }, players: {}, selfId: null });
    retryTimer = setTimeout(() => void joinLobby(lobby, me && { x: me.x, y: me.y }), RETRY_MS);
  });
}

export const sendMove = (msg: MoveMsg) => room?.send(MSG.move, msg);
export const sendMedia = (msg: MediaMsg) => room?.send(MSG.media, msg);
export const sendRtc = (to: string, data: RtcData) => room?.send(MSG.rtc, { to, data } satisfies Relay<RtcData>);
export const sendCall = (to: string, data: CallKind) => room?.send(MSG.call, { to, data } satisfies Relay<CallKind>);
export const onRtc = (h: RelayHandler<RtcData>) => void rtcHandlers.add(h);
export const onCall = (h: RelayHandler<CallKind>) => void callHandlers.add(h);

/** The owner changed their office (the studio writes `store.office`): tell the room, and save it. */
store.watch((s) => s.office, (office) => {
  if (office === roomOffice || !room || !ownsLobby()) return;
  room.send(MSG.office, office);
  saveOffice(office);
});
/** Out of the studio the room is the authority again: take what it holds (normally the same layout). */
store.watch((s) => s.view === "studio", (inStudio) => !inStudio && officeJson && takeRoomOffice());

/** Keep the room's copy of our profile in step with the store. */
for (const field of ["playerName", "avatar", "founder"] as const) store.watch((s) => s[field], () => room?.send(MSG.profile, profile()));

/** Email an invite through the server. `unavailable` = it cannot send email (not configured, unreachable): use `mailto:` instead. */
export async function emailInvite(email: string, lobby: string): Promise<{ ok: boolean; error?: string; unavailable?: boolean }> {
  try {
    const res = await fetch(`${SERVER_URL}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await getToken()) ?? ""}` },
      body: JSON.stringify({ email, lobby, name: store.get().playerName }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 501) return { ok: false, unavailable: true };
    return { ok: false, error: ((await res.json()) as { error?: string }).error ?? "Could not send the invite." };
  } catch {
    return { ok: false, unavailable: true };
  }
}
