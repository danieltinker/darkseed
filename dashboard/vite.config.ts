import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.DARKSEED_API ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
