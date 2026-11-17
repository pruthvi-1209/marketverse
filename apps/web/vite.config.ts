import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same-origin proxy to the API (used by both dev and production preview)
// so the browser never depends on CORS.
const apiProxy = {
  "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
  "/health": { target: "http://127.0.0.1:4000", changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 and IPv6 loopback so http://127.0.0.1:5173 works alongside http://localhost:5173.
    host: true,
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    host: true,
    port: 4173,
    proxy: apiProxy,
  },
});
