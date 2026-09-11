// @interview-coach/web-client — Vite + React (HLD Phase 4 / S4).
//
// Frozen section 7: no `VITE_AZURE_*` vars, no Azure SDK in the client. The
// only env the bundle reads is `VITE_BACKEND_URL`. Voice Live credentials
// arrive per-interview from `POST /api/interviews/:id/voice-session` and are
// never baked into the bundle. Audio is Browser<->Voice Live direct (frozen
// section 2); the backend is never a media proxy.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
