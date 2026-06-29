import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        calculator: "calculator.html",
      },
    },
  },
  test: {
    // Never recurse into isolated agent worktrees — they carry duplicate copies
    // of the test files and inflate/duplicate the run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
