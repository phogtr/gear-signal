import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// proxy forwards to Go server so there is no CORS setup in development
// PORT comes from the root .env
const apiTarget = `http://localhost:${process.env.PORT ?? "3000"}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
