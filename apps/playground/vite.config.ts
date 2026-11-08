import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: false,
  build: {
    sourcemap: false,
    rolldownOptions: { input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), frame: fileURLToPath(new URL("./frame.html", import.meta.url)) } }
  },
  server: { host: "127.0.0.1", port: 4545, strictPort: true }
});
