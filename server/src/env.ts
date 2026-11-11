import { fileURLToPath } from "node:url";

/**
 * Server configuration, read once from the environment and the repo-root `.env` (shared with the
 * client, so the Supabase values are written once — the `VITE_` names are accepted here too).
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  /* no .env file — the environment is already set (production) */
}

const e = process.env;
const production = e.NODE_ENV === "production";

export const env = {
  port: Number(e.PORT ?? 2567),
  supabaseUrl: e.SUPABASE_URL ?? e.VITE_SUPABASE_URL ?? "",
  /** Supabase's public client key ("publishable" in new projects, "anon" in older ones). The server needs no secret key. */
  supabaseAnonKey: e.SUPABASE_PUBLISHABLE_KEY ?? e.SUPABASE_ANON_KEY ?? e.VITE_SUPABASE_PUBLISHABLE_KEY ?? e.VITE_SUPABASE_ANON_KEY ?? "",
  /** Without Supabase the server lets anyone in as a guest. Fine on a laptop, opt-in anywhere else. */
  allowGuests: e.ALLOW_GUESTS ? e.ALLOW_GUESTS === "1" : !production,
  /** Where the web client lives — used for invite links and CORS. */
  appUrl: (e.APP_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  /** Invite emails (https://resend.com). Without a key the client falls back to a mailto: link. */
  resendKey: e.RESEND_API_KEY ?? "",
  mailFrom: e.MAIL_FROM ?? "Founder Town <onboarding@resend.dev>",
  /** Tiled map the room validates movement against (the same file the client renders). */
  mapPath: e.MAP_PATH ?? fileURLToPath(new URL("../../client/public/assets/maps/town.tmj", import.meta.url)),
};

export const supabaseConfigured = !!(env.supabaseUrl && env.supabaseAnonKey);

if (!supabaseConfigured && !env.allowGuests) {
  console.error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required (or set ALLOW_GUESTS=1).");
  process.exit(1);
}
