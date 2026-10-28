import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // Component tests that need the DOM opt in with a file-level docblock:
    //   // @vitest-environment jsdom
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside RSC; alias to a no-op stub for tests.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
