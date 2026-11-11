import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: "..", // one .env at the repo root, shared with the server
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  build: { chunkSizeWarningLimit: 1200 },
});
