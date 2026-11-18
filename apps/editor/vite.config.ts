import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rutas relativas: el mismo build funciona en Tauri (tauri.localhost/...) y,
  // para el stage, servido por Axum en http://127.0.0.1:4322/stage/.
  base: "./",
  build: {
    // Todas las apps van a dist/app (frontendDist de Tauri). `pnpm build` limpia antes.
    outDir: "../../dist/app/editor",
    emptyOutDir: false,
  },
  // Evita copias duplicadas de React al consumir @concursillo/ui desde el workspace.
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 4324, strictPort: true, host: "localhost" },
  preview: { port: 4324, strictPort: true },
});
