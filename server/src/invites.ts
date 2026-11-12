/** POST /invites — email someone a link to a lobby. Signed-in users only, rate limited per user. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAIN_LOBBY, isLobby, sanitizeName } from "@ft/shared";
import { verifyUser } from "./auth.js";
import { env, supabaseConfigured } from "./env.js";

const PER_HOUR = 20;
const sent = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const cutoff = Date.now() - 3_600_000;
  const recent = (sent.get(userId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= PER_HOUR) return false;
  sent.set(userId, [...recent, Date.now()]);
  return true;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("too large");
  }
  return JSON.parse(raw || "{}") as Record<string, unknown>;
}

export function lobbyLink(lobby: string): string {
  return lobby === MAIN_LOBBY ? `${env.appUrl}/play` : `${env.appUrl}/play/${lobby}`;
}

export async function handleInvite(req: IncomingMessage, res: ServerResponse) {
  const reply = (status: number, error?: string) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(error ? { error } : { ok: true }));
  };
  try {
    // 501 tells the client to fall back to the user's own mail app (mailto:).
    if (!env.resendKey || !supabaseConfigured) return reply(501, "Email invites are not configured.");
    const user = await verifyUser(req.headers.authorization?.replace(/^Bearer /, ""));
    if (!user) return reply(401, "Sign in first.");

    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, "That email address does not look right.");
    if (!isLobby(body.lobby)) return reply(400, "Unknown lobby.");
    if (!allowed(user.id)) return reply(429, "Too many invites — try again in an hour.");

    const name = escapeHtml(sanitizeName(body.name, "A founder"));
    const link = lobbyLink(body.lobby);
    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.mailFrom,
        to: email,
        reply_to: user.email ?? undefined,
        subject: `${sanitizeName(body.name, "A founder")} invited you to Founder Town`,
        html: `<p>${name} invited you to their lobby in Founder Town — a small pixel-art world for startup founders.</p><p><a href="${link}">Join the lobby</a></p><p style="color:#888">${link}</p>`,
      }),
    });
    if (!mail.ok) {
      console.error("invite email failed", mail.status, await mail.text());
      return reply(502, "Could not send the email.");
    }
    reply(200);
  } catch {
    reply(400, "Bad request.");
  }
}
