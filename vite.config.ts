import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // Adds polyfills for Node.js built-ins like crypto and buffer
    nodePolyfills({
      protocolImports: true, // Allow 'node:crypto' imports
    }),
  ],
});
