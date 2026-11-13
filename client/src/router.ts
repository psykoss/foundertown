/**
 * URL ↔ session status. The client is one page that serves several paths (the web server rewrites
 * them all to it); the session status decides which screen shows, and this keeps the address bar
 * on the matching path:
 *
 *   /login  /signup  /forgot-password   signed out
 *   /reset-password                     choosing a new password (from the reset email)
 *   /onboarding                         signed in, questions not answered yet
 *   /play  /play/<lobby>                in the town
 *   /studio/<lobby>                     editing your office (your own lobby only)
 *
 * A private lobby rides along as `?lobby=<code>` on the auth/onboarding paths, so an invite link
 * survives sign-in (OAuth and email links come back to the URL they left from).
 */
import { MAIN_LOBBY } from "@ft/shared";
import { store, type Session } from "./state/store";

export type AuthMode = "signIn" | "signUp" | "reset";

export const AUTH_PATHS: Record<AuthMode, string> = { signIn: "/login", signUp: "/signup", reset: "/forgot-password" };
const RECOVERY_PATH = "/reset-password";
const ONBOARDING_PATH = "/onboarding";
export const PLAY_PATH = "/play";
export const STUDIO_PATH = "/studio";
/** The page was opened on a studio link: the studio opens once we are in that lobby (`main.tsx`). */
export const openedOnStudio = location.pathname.startsWith(`${STUDIO_PATH}/`);

const path = () => location.pathname.replace(/\/+$/, "") || "/";

/** Auth screen the URL asks for (`?join` is the landing page's old "Join now" link). */
export function authModeFromUrl(): AuthMode {
  if (new URLSearchParams(location.search).has("join")) return "signUp";
  const p = path();
  return (Object.keys(AUTH_PATHS) as AuthMode[]).find((m) => AUTH_PATHS[m] === p) ?? "signIn";
}

/** Lobby code in the URL: `/play/<code>` or `/studio/<code>`, else `?lobby=<code>` (auth/onboarding paths, old links). */
export function lobbyCodeFromUrl(): string | null {
  const m = /^\/(?:play|studio)\/([^/]+)$/.exec(path());
  return m?.[1] ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get("lobby");
}

/** Replace the address (no new history entry), keeping the lobby code with it. */
function go(to: string) {
  const code = lobbyCodeFromUrl();
  const url = to === PLAY_PATH ? (code ? `${PLAY_PATH}/${encodeURIComponent(code)}` : PLAY_PATH) : code ? `${to}?lobby=${encodeURIComponent(code)}` : to;
  if (url !== location.pathname + location.search) history.replaceState(null, "", url + location.hash);
}

/** Auth screen switched (sign in ↔ sign up ↔ forgot password). */
export function showAuthMode(mode: AuthMode) {
  go(AUTH_PATHS[mode]);
}

function sync(status: Session["status"]) {
  if (status === "loading") return;
  if (status === "signedOut") return go(AUTH_PATHS[authModeFromUrl()]);
  if (status === "recovery") return go(RECOVERY_PATH);
  if (status === "onboarding") return go(ONBOARDING_PATH);
  // ready: `place()` puts the exact lobby in the URL once joined; until then /play[/code] (or the studio link we came in on).
  if (!path().startsWith(PLAY_PATH) && !path().startsWith(STUDIO_PATH)) go(PLAY_PATH);
}

/** In the town: the address names the lobby we are in, and the studio while it is open. */
function place() {
  const { session, net, view } = store.get();
  if (session.status !== "ready" || net.status !== "online") return;
  const main = net.lobby === MAIN_LOBBY;
  const url = view === "studio" && !main ? `${STUDIO_PATH}/${net.lobby}` : main ? PLAY_PATH : `${PLAY_PATH}/${net.lobby}`;
  if (url !== location.pathname + location.search) history.replaceState(null, "", url);
}

/** Keep the address bar on the path for the current session status (and lobby). */
export function startRouter() {
  let last: Session["status"] | null = null;
  const check = () => {
    const status = store.get().session.status;
    if (status !== last) sync((last = status));
    place();
  };
  store.subscribe(check);
  check();
}
