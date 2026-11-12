import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  envDir: "..", // one .env at the repo root, shared with the server
  plugins: [react()],
  // Production: the files live under /app/ next to the landing page (deploy/Caddyfile), while the
  // routes (/login, /onboarding, /play/…) all serve this page. Dev serves it at the root.
  base: command === "build" ? "/app/" : "/",
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
}));
