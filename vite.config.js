import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import partials from './scripts/vite-partials.mjs';

const page = (file) => resolve(import.meta.dirname, file);

export default defineConfig({
  plugins: [partials()],
  build: {
    // The lazy-loaded three.js chunk is ~530 kB minified (~135 kB gzipped) and Vite warns about anything
    // over 500 kB. It is not on the critical path (hero.js imports it after first paint), so the number
    // that matters is the gzipped budget in CLAUDE.md (300 KB for the whole home page, lazy chunks
    // included). scripts/size-report.mjs enforces that after every `npm run build` (the `postbuild`
    // script) and fails the build if it is exceeded. Raise this if the scene chunk legitimately grows.
    chunkSizeWarningLimit: 600,
    // Vite 8 renamed `rollupOptions` to `rolldownOptions` (the old name still works but is
    // deprecated). Every page must be listed here, or it is missing from the production build.
    rolldownOptions: {
      input: {
        home: page('index.html'),
        notFound: page('404.html'),
        'enterprise-knowledge-assistant': page('projects/enterprise-knowledge-assistant.html'),
        'filing-reconciler': page('projects/filing-reconciler.html'),
        supportlens: page('projects/supportlens.html'),
        'youtube-rag-chatbot': page('projects/youtube-rag-chatbot.html'),
      },
    },
  },
});
