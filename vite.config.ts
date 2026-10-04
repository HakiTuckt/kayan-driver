import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { generateProjects } from './src/project-export/generate-projects.mjs';

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
    transformIndexHtml: html => mode === 'driver' ? html.replace('<title>KAYAN Passenger Demo</title>', '<title>KAYAN Driver Demo</title>') : html,
  }, {
    name: 'kayan-source-projects-preview',
    apply: 'serve',
    async configureServer() {
      await generateProjects(path.resolve('public/downloads'));
    },
  }, {
    name: 'kayan-source-projects-build',
    apply: 'build',
    async buildStart() {
      await generateProjects(path.resolve('public/downloads'), true);
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
