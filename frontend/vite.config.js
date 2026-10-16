import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In dev (and `vite preview`) every /api/* call is proxied to the Next.js backend,
// so the browser sees ONE origin and the httpOnly admin cookie just works.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api": { target: env.BACKEND_URL || "http://localhost:3000", changeOrigin: true },
  };
  return { plugins: [react()], server: { port: 5173, proxy }, preview: { port: 4173, proxy } };
});
