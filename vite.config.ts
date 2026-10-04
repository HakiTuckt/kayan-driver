import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_VARIANT': JSON.stringify(mode === 'driver' ? 'driver' : 'passenger'),
  },
  build: {
    outDir: mode === 'driver' ? 'dist-driver' : 'dist',
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [dyadComponentTagger(), react(), {
    name: 'kayan-driver-title',
    transformIndexHtml: html => mode === 'driver' ? html.replace('<title>dyad-generated-app</title>', '<title>KAYAN Driver Demo</title>') : html,
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
