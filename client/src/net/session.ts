/**
 * Account + profile. Supabase Auth signs people in (Google or email/password); the `profiles` row
 * holds everything about them. This module owns the Supabase client (the office layout is saved
 * through it by `office.ts`): it loads the row into the store on sign-in and writes store changes
 * back, so the UI just edits the store.
 *
 * Without Supabase configured the app runs in guest mode (local profile, no sign-in) for development.
 */
import { createClient, type User } from "@supabase/supabase-js";
import { sanitizeFounder, sanitizeName, type Avatar, type FounderProfile } from "@ft/shared";
import { store, type AppState, type Session } from "../state/store";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Shared by the net layer only (`office.ts` saves the office through it). */
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const authEnabled = !!supabase;

const COLUMNS = "name,time_zone,picture,avatar,onboarding,onboarded_at,lobby_code";
interface Row {
  name: string;
  time_zone: string | null;
  picture: string | null;
  avatar: Avatar | null;
  onboarding: unknown;
  onboarded_at: string | null;
  lobby_code: string;
}

/** Guest mode keeps the same data in localStorage. */
const FOUNDER_KEY = "ft.founder.v1";
const LOBBY_KEY = "ft.lobby.v1";
const GUEST_KEY = "ft.guest.v1";

const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Set while a password-reset link is being handled: the new-password form comes before the game. */
let recovering = false;
/** Where the account goes once nothing else is pending. */
let home: Session["status"] = "onboarding";
const setStatus = (status: Session["status"]) => store.set((s) => ({ session: { ...s.session, status } }));
const settle = () => setStatus(recovering ? "recovery" : home);

/** The profile fields mirrored to the database, and the values last known to be saved. */
const synced = (s: AppState) => [s.playerName, s.timeZone, s.picture, s.avatar, s.founder] as const;
let saved: ReturnType<typeof synced> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function save() {
  const s = store.get();
  if (!supabase || !s.session.userId) return;
  const next = synced(s);
  const { error } = await supabase
    .from("profiles")
    .update({ name: s.playerName, time_zone: s.timeZone, picture: s.picture, avatar: s.avatar, onboarding: s.founder })
    .eq("id", s.session.userId);
  if (error) store.set({ notice: "Could not save your profile — check your connection." });
  else saved = next;
}

async function loadProfile(user: User) {
  if (!supabase) return;
  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string };
  let { data, error } = await supabase.from("profiles").select(COLUMNS).eq("id", user.id).maybeSingle<Row>();
  if (!data && !error) {
    // No row yet (account older than the sign-up trigger): create it.
    const name = sanitizeName(meta.full_name ?? meta.name ?? user.email?.split("@")[0]);
    ({ data, error } = await supabase.from("profiles").insert({ id: user.id, name, picture: meta.avatar_url ?? null }).select(COLUMNS).single<Row>());
  }
  if (!data) {
    store.set({ notice: `Could not load your profile: ${error?.message ?? "unknown error"}`, session: { status: "signedOut", userId: null, email: null } });
    return;
  }
  store.set((s) => ({
    playerName: data.name,
    timeZone: data.time_zone ?? s.timeZone,
    picture: data.picture,
    avatar: data.avatar ?? s.avatar,
    founder: data.onboarded_at ? sanitizeFounder(data.onboarding) : null,
    myLobby: data.lobby_code,
  }));
  saved = synced(store.get());
  home = data.onboarded_at ? "ready" : "onboarding";
  settle();
}

export function initSession() {
  if (!supabase) {
    const raw = local.get(FOUNDER_KEY);
    let lobby = local.get(LOBBY_KEY);
    if (!lobby) local.set(LOBBY_KEY, (lobby = crypto.randomUUID().replace(/-/g, "").slice(0, 12)));
    const founder = raw ? sanitizeFounder(JSON.parse(raw)) : null;
    home = founder ? "ready" : "onboarding";
    // Guests still pass the sign-in screen once ("Continue as guest"), so the flow matches production.
    store.set({ founder, myLobby: lobby, session: { status: local.get(GUEST_KEY) ? home : "signedOut", userId: null, email: null } });
    store.watch((s) => s.founder, (f) => f && local.set(FOUNDER_KEY, JSON.stringify(f)));
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (!user) return store.set({ session: { status: "signedOut", userId: null, email: null } });
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      setStatus("recovery");
    }
    if (user.id === store.get().session.userId) return; // token refresh, tab focus…
    store.set({ session: { status: recovering ? "recovery" : "loading", userId: user.id, email: user.email ?? null } });
    // Supabase must not be called from inside this callback (it holds the auth lock).
    setTimeout(() => void loadProfile(user), 0);
  });

  // Write profile edits back, debounced so typing or trying outfits is one request.
  store.subscribe(() => {
    const s = store.get();
    if (!saved || !s.session.userId) return;
    const now = synced(s);
    if (now.every((v, i) => v === saved![i])) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), 600);
  });
}

/** Guest mode only: enter without an account. */
export function continueAsGuest() {
  local.set(GUEST_KEY, "1");
  settle();
}

/** Access token for the multiplayer server (undefined in guest mode). */
export async function getToken(): Promise<string | undefined> {
  return (await supabase?.auth.getSession())?.data.session?.access_token;
}

/** Each action resolves to an error message, or null when it worked. */
type Result = Promise<string | null>;

export async function signInWithGoogle(): Result {
  // Come back to this exact URL so an invite link (?lobby=…) survives the round trip.
  const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
  return error?.message ?? null;
}

export async function signInWithPassword(email: string, password: string): Result {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

/** Resolves to "confirm" when the account exists but the email still has to be confirmed. */
export async function signUp(email: string, password: string): Promise<string | null | "confirm"> {
  const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
  if (error) return error.message;
  return data.session ? null : "confirm";
}

export async function sendPasswordReset(email: string): Result {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password${location.search}` });
  return error?.message ?? null;
}

export async function setNewPassword(password: string): Result {
  const { error } = await supabase!.auth.updateUser({ password });
  if (error) return error.message;
  recovering = false;
  settle();
  return null;
}

/** Answers from the onboarding form (also used to edit them later). */
export async function saveFounder(name: string, founder: FounderProfile): Result {
  const s = store.get();
  if (supabase && s.session.userId && home !== "ready") {
    const { error } = await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", s.session.userId);
    if (error) return error.message;
  }
  store.set({ playerName: sanitizeName(name), founder });
  home = "ready";
  settle();
  return null;
}

export async function signOut() {
  await supabase?.auth.signOut();
  location.reload(); // drops the room, the calls and every piece of in-memory state at once
}
