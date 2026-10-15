import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// proxy forwards to Go server so there is no CORS setup in development
// PORT comes from the root .env
const apiTarget = `http://localhost:${process.env.PORT ?? "3000"}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // node by default; component tests opt in with `// @vitest-environment jsdom`
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
