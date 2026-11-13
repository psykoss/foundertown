/**
 * Identity comes from Supabase: the client sends its access token, we ask Supabase who it belongs to.
 * The server holds no service key — every query runs as the calling user, under row-level security.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAIN_LOBBY, isLobby } from "@ft/shared";
import { env, supabaseConfigured } from "./env.js";

export interface User {
  id: string;
  email: string | null;
}

function asUser(token: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Who is this token? null = not signed in. In guest mode (no Supabase) everyone is an anonymous guest. */
export async function verifyUser(token: unknown): Promise<User | null> {
  if (!supabaseConfigured) return { id: "guest", email: null };
  if (typeof token !== "string" || !token) return null;
  const { data, error } = await asUser(token).auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** What the room needs to know about a lobby for the person entering it. */
export interface LobbyInfo {
  title: string;
  /** The caller owns this lobby: they may change its office. */
  owner: boolean;
  /** Saved office layout (unchecked JSON), null if there is none. */
  layout: unknown;
}

/** Guest mode has no database: offices live here for as long as the server runs (the owner's browser keeps its own copy). */
const guestOffices = new Map<string, unknown>();
export const rememberGuestOffice = (code: string, layout: unknown) => void guestOffices.set(code, layout);

/** Title, ownership and saved office of a lobby, or null if no such lobby exists. */
export async function lobbyInfo(code: unknown, token: unknown): Promise<LobbyInfo | null> {
  if (!isLobby(code)) return null;
  if (code === MAIN_LOBBY) return { title: "Main lobby", owner: false, layout: null };
  if (!supabaseConfigured) return { title: "Private lobby", owner: true, layout: guestOffices.get(code) ?? null };
  const db = asUser(String(token));
  const office = await db.rpc("lobby_office", { code });
  if (!office.error) {
    const row = office.data as { name?: unknown; mine?: unknown; layout?: unknown } | null;
    return typeof row?.name === "string" ? { title: `${row.name}'s lobby`, owner: row.mine === true, layout: row.layout ?? null } : null;
  }
  // Database older than migration 0002 (no offices yet): the lobby still opens, as an empty office nobody can edit.
  const { data, error } = await db.rpc("lobby_info", { code });
  return error || typeof data !== "string" ? null : { title: `${data}'s lobby`, owner: false, layout: null };
}
