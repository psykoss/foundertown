/**
 * Client ↔ server contract for the multiplayer room. Both sides import these names and shapes,
 * so a change here is a compile error on whichever side was not updated.
 */
import type { Avatar } from "./avatar.js";
import type { FounderProfile } from "./founder.js";
import type { Dir } from "./spec.js";

/** Colyseus room name. One room instance per lobby (and more when a lobby is full). */
export const ROOM = "town";
export const MAIN_LOBBY = "main";
/** Private lobbies are addressed by an unguessable code — knowing the code (the invite link) is the access. */
export const LOBBY_CODE = /^[a-z0-9]{8,32}$/;
export const MAX_PLAYERS = 50;

export function isLobby(code: unknown): code is string {
  return code === MAIN_LOBBY || (typeof code === "string" && LOBBY_CODE.test(code));
}

/** Sent with joinOrCreate. */
export interface JoinOptions {
  lobby: string;
  /** Supabase access token (absent only when the server runs in guest mode). */
  token?: string;
  name: string;
  avatar: Avatar;
  founder: FounderProfile;
  /** Rejoining after a dropped connection: stand where you were instead of at the spawn. */
  at?: { x: number; y: number };
}

/** A player as synced in the room state (`state.players`, keyed by session id). */
export interface PlayerState {
  name: string;
  /** JSON of an `Avatar`. */
  avatar: string;
  stage: string;
  building: string;
  /** Comma-separated GOALS ids. */
  goals: string;
  x: number;
  y: number;
  dir: string;
  speaking: boolean;
  cam: boolean;
}

export const MSG = {
  /** c→s: I stepped onto / turned on this tile. */
  move: "move",
  /** s→c: your position was rejected or assigned — stand here. */
  snap: "snap",
  /** c→s: name / avatar / founder profile changed. */
  profile: "profile",
  /** c→s: speaking / camera flags. */
  media: "media",
  /** both ways, relayed: WebRTC signaling between two players. */
  rtc: "rtc",
  /** both ways, relayed: video-call handshake between two players. */
  call: "call",
} as const;

export interface MoveMsg { x: number; y: number; dir: Dir }
export interface SnapMsg { x: number; y: number }
export interface ProfileMsg { name: string; avatar: Avatar; founder: FounderProfile }
export interface MediaMsg { speaking?: boolean; cam?: boolean }

export type RtcData = { sdp: { type: string; sdp?: string } } | { ice: unknown } | { bye: true };
export type CallKind = "invite" | "accept" | "decline" | "end";
/** Relayed messages carry `to` on the way up and `from` on the way down. */
export interface Relay<T> { to?: string; from?: string; data: T }

/**
 * Proximity voice, in tiles. Peers connect inside `connect` and drop beyond `disconnect` (the gap
 * stops flapping at the edge); volume is full within `full` and fades to nothing at `silent`.
 */
export const VOICE = { connect: 6, disconnect: 8, full: 2, silent: 6 } as const;

export function tileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function voiceVolume(distance: number): number {
  if (distance <= VOICE.full) return 1;
  if (distance >= VOICE.silent) return 0;
  return 1 - (distance - VOICE.full) / (VOICE.silent - VOICE.full);
}
