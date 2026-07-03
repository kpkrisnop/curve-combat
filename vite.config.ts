import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        calculator: "calculator.html",
      },
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    pool: "vmThreads",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
  },
});
