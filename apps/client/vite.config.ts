import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Phaser alone is larger than Vite's default warning threshold.
    chunkSizeWarningLimit: 2000,
  },
});
