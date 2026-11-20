import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves project sites from /<repo>/, so assets need that base in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/gh-repo-dora/" : "/",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"] },
}));
