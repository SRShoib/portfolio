import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import partials from './scripts/vite-partials.mjs';

const page = (file) => resolve(import.meta.dirname, file);

export default defineConfig({
  plugins: [partials()],
  build: {
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
