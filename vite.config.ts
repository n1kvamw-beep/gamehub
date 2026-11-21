import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };
export default defineConfig({ plugins: [react()], server: { host: true, headers: isolation }, preview: { headers: isolation } });