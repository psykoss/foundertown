import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/{src,tests}/**/*.test.{ts,tsx}"],
  },
});
