/**
 * URL ↔ session status. The client is one page that serves several paths (the web server rewrites
 * them all to it); the session status decides which screen shows, and this keeps the address bar
 * on the matching path:
 *
 *   /login  /signup  /forgot-password   signed out
 *   /reset-password                     choosing a new password (from the reset email)
 *   /onboarding                         signed in, questions not answered yet
 *   /play  /play/<lobby>                in the town
 *
 * A private lobby rides along as `?lobby=<code>` on the auth/onboarding paths, so an invite link
 * survives sign-in (OAuth and email links come back to the URL they left from).
 */
import { store, type Session } from "./state/store";

export type AuthMode = "signIn" | "signUp" | "reset";

export const AUTH_PATHS: Record<AuthMode, string> = { signIn: "/login", signUp: "/signup", reset: "/forgot-password" };
const RECOVERY_PATH = "/reset-password";
const ONBOARDING_PATH = "/onboarding";
export const PLAY_PATH = "/play";

const path = () => location.pathname.replace(/\/+$/, "") || "/";

/** Auth screen the URL asks for (`?join` is the landing page's old "Join now" link). */
export function authModeFromUrl(): AuthMode {
  if (new URLSearchParams(location.search).has("join")) return "signUp";
  const p = path();
  return (Object.keys(AUTH_PATHS) as AuthMode[]).find((m) => AUTH_PATHS[m] === p) ?? "signIn";
}

/** Lobby code in the URL: `/play/<code>`, else `?lobby=<code>` (auth/onboarding paths, old links). */
export function lobbyCodeFromUrl(): string | null {
  const m = /^\/play\/([^/]+)$/.exec(path());
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
  // ready: the room puts the exact lobby in the URL once joined (`lobbyUrl`); until then /play[/code].
  if (!path().startsWith(PLAY_PATH)) go(PLAY_PATH);
}

/** Keep the address bar on the path for the current session status. */
export function startRouter() {
  let last: Session["status"] | null = null;
  const check = () => {
    const status = store.get().session.status;
    if (status !== last) sync((last = status));
  };
  store.subscribe(check);
  check();
}
