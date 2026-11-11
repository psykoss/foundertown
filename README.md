# Founder Town

2D pixel-art social world for startup founders — top-down 3/4 view, layered avatars, Tiled maps.

```bash
pnpm install
pnpm assets      # generate missing placeholder art + map, validate
pnpm dev         # client http://localhost:5173 + multiplayer server :2567
```

With no configuration this runs in **guest mode** (no sign-in) — good for development. Open two tabs to see multiplayer.

## Going live
1. **Supabase** — create a project, run `supabase/migrations/0001_profiles.sql` in the SQL editor. Under Authentication → Providers enable Email and Google (Google needs an OAuth client from Google Cloud with Supabase's callback URL). Under Authentication → URL Configuration set the Site URL to your app and add `https://your-app/**` (and `http://localhost:5173/**`) to the redirect URLs.
2. **Env** — copy `.env.example` → `.env` at the repo root (one file for client, server and landing page) and fill in the project URL + publishable key. For production set the same variables in your hosts, plus `VITE_SERVER_URL`, `APP_URL` and `VITE_APP_URL`.
3. **Server** — any Node 20.12+ host with WebSockets (Fly, Railway, Render, Colyseus Cloud): `docker build -f server/Dockerfile .` or `pnpm install && pnpm start:server`. Serve it over HTTPS/WSS.
4. **Client** — `pnpm build`, deploy `client/dist` to any static host (HTTPS is required for microphone and camera).
5. **Optional** — `RESEND_API_KEY` + `MAIL_FROM` for invite emails (otherwise invites open the sender's mail app); a TURN server in `VITE_ICE_SERVERS` so calls connect behind strict firewalls.

Landing page (animated isometric city): `pnpm dev:landing` → http://localhost:5180. Set `VITE_APP_URL` in `.env` to where the game is hosted; `pnpm build:landing` outputs `landing/dist`.

Controls: WASD / arrows or click to walk · click a player to see their card and video call them · mic/camera in the bottom bar (voice is by proximity) · **Avatar** opens the character builder · F1 grid · F2 collision · F3 depth.

- Architecture & rules for Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Engine & art spec: [`docs/spec.md`](docs/spec.md)
