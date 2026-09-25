import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import partials from './scripts/vite-partials.mjs';

const page = (file) => resolve(import.meta.dirname, file);

export default defineConfig({
  plugins: [partials()],
  build: {
    // The lazy-loaded scene chunk (three.js + the four point-cloud shape builders) is ~630 kB
    // minified (~160 kB gzipped) and Vite warns about anything over its default 500 kB. It is not on
    // the critical path (hero.js imports it after first paint), so the number that matters is the
    // gzipped budget in CLAUDE.md (300 KB total / 100 KB initial for the whole home page).
    // scripts/size-report.mjs enforces THAT after every `npm run build` (the `postbuild` script) and
    // fails the build if either is exceeded — per CLAUDE.md, only the person running this project can
    // raise those two. This setting is a different, cosmetic thing: it only silences Vite's own
    // minified-size warning in the build log, so raising it needs no such approval. Bumped again here
    // (M3c added the graph shape); if it starts feeling like a limit to work around rather than a
    // warning to quiet, that is a sign to revisit chunk splitting instead of raising it again.
    chunkSizeWarningLimit: 700,
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
