/** Founder Town multiplayer server: one Colyseus room type, one room per lobby, plus the invite endpoint. */
import { Server, WebSocketTransport } from "colyseus";
import { ROOM } from "@ft/shared";
import { env, supabaseConfigured } from "./env.js";
import { handleInvite } from "./invites.js";
import { TownRoom } from "./TownRoom.js";

const server = new Server({
  greet: false,
  // WebRTC offers (relayed as messages) are a few KB — above the transport's 4 KB default.
  transport: new WebSocketTransport({ maxPayload: 32 * 1024 }),
  express: (app) => {
    app.get("/health", (_req, res) => void res.json({ ok: true }));
    app.use("/invites", (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", env.appUrl);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (req.method === "OPTIONS") return void res.writeHead(204).end();
      if (req.method !== "POST") return void res.writeHead(405).end();
      void handleInvite(req, res);
    });
  },
});

// Players asking for the same lobby land in the same room; a full lobby opens another instance.
server.define(ROOM, TownRoom).filterBy(["lobby"]);

await server.listen(env.port);
console.log(`Founder Town server on :${env.port} — ${supabaseConfigured ? "Supabase auth" : "GUEST MODE (no Supabase configured)"}`);
