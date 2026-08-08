import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 8081,
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/geojson": "http://127.0.0.1:3000"
    }
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500
  }
});
