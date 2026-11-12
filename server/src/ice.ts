/**
 * ICE servers for WebRTC (`GET /ice`). With a Cloudflare Realtime TURN key configured, signed-in
 * players get short-lived TURN credentials, so calls also work behind strict NATs and firewalls.
 * The API token never leaves the server. Without a key the client falls back to plain STUN.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyUser } from "./auth.js";
import { env } from "./env.js";

/** Credentials live a day; one set is shared for an hour, so every client gets ≥ 23 h of use. */
const TTL_S = 24 * 60 * 60;
const SHARE_MS = 60 * 60 * 1000;
let cached: { servers: RTCIceServerLike[]; until: number } | null = null;

interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

async function cloudflareIce(): Promise<RTCIceServerLike[]> {
  if (cached && Date.now() < cached.until) return cached.servers;
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.turnKeyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.turnApiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL_S }),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { iceServers: RTCIceServerLike | RTCIceServerLike[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
  // Port 53 URLs are blocked by browsers and only slow down gathering (Cloudflare's own advice).
  const servers = list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
  cached = { servers, until: Date.now() + SHARE_MS };
  return servers;
}

export async function handleIce(req: IncomingMessage, res: ServerResponse) {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (!env.turnKeyId || !env.turnApiToken) return reply(200, { iceServers: null });
  const user = await verifyUser(req.headers.authorization?.replace(/^Bearer /, ""));
  if (!user) return reply(401, { error: "Sign in first." });
  try {
    reply(200, { iceServers: await cloudflareIce() });
  } catch (e) {
    console.error("TURN credentials failed:", (e as Error).message);
    reply(502, { iceServers: null });
  }
}
