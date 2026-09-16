import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so tests import modules by
    // the same specifier the application uses.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
