import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: true,
    allowedHosts: [".trycloudflare.com"],
  },
  build: {
    rollupOptions: {
      output: {
        // Each of these is large and changes far less often than the app code, so it caches separately across deploys.
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-motion": ["motion"],
          "vendor-charts": ["@visx/group", "@visx/responsive", "@visx/shape", "d3-shape", "perfect-freehand"],
        },
      },
    },
  },
});