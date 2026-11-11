import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "..", // one .env at the repo root, shared with the server
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
