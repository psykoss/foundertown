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

/** Display title of a lobby, or null if no such lobby exists. */
export async function lobbyTitle(code: unknown, token: unknown): Promise<string | null> {
  if (!isLobby(code)) return null;
  if (code === MAIN_LOBBY) return "Main lobby";
  if (!supabaseConfigured) return "Private lobby";
  const { data, error } = await asUser(String(token)).rpc("lobby_info", { code });
  return error || typeof data !== "string" ? null : `${data}'s lobby`;
}
