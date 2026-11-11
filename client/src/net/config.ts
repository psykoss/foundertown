/** Client configuration from Vite env (the repo-root `.env`, see `.env.example`). */
const e = import.meta.env;

export const SUPABASE_URL: string = e.VITE_SUPABASE_URL ?? "";
/** Supabase's public client key: "publishable" in new projects, "anon" in older ones. */
export const SUPABASE_ANON_KEY: string = e.VITE_SUPABASE_PUBLISHABLE_KEY ?? e.VITE_SUPABASE_ANON_KEY ?? "";
/** Multiplayer server (http[s] origin). Defaults to this host on the dev port. */
export const SERVER_URL: string = (e.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:2567`).replace(/\/$/, "");

/**
 * STUN finds a direct route between two browsers; it is enough on most home networks.
 * Add a TURN server (JSON array of RTCIceServer in VITE_ICE_SERVERS) so calls also work behind strict firewalls.
 */
export const ICE_SERVERS: RTCIceServer[] = e.VITE_ICE_SERVERS
  ? (JSON.parse(e.VITE_ICE_SERVERS) as RTCIceServer[])
  : [{ urls: "stun:stun.l.google.com:19302" }];
