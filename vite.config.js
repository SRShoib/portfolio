import { defineConfig } from 'vite';
import { basename, relative, resolve } from 'node:path';
import partials from './scripts/vite-partials.mjs';

const page = (file) => resolve(import.meta.dirname, file);

// M8 (CLAUDE.md §12): the domain was deferred until now. This placeholder is the Vercel default
// domain for this project; it is the ONLY place the site's absolute URL is hard-coded (head.html,
// robots.txt and sitemap.xml all read it from here through `partials({ vars })` and `sitemapPlugin`
// below). After the first deploy, replace this one line with the real URL and rebuild.
const SITE_URL = 'https://portfolio-shoib.vercel.app';

const input = {
  home: page('index.html'),
  notFound: page('404.html'),
  'enterprise-knowledge-assistant': page('projects/enterprise-knowledge-assistant.html'),
  'filing-reconciler': page('projects/filing-reconciler.html'),
  supportlens: page('projects/supportlens.html'),
  'youtube-rag-chatbot': page('projects/youtube-rag-chatbot.html'),
};

/** Writes sitemap.xml and robots.txt from the SAME page list the build already uses, so a page
 *  added to `input` above appears in the sitemap without a second list to keep in sync. The 404
 *  page is deliberately excluded: it is not a real, indexable URL. `generateBundle` runs once for
 *  the whole multi-page build (not once per HTML entry), so this only emits each file once. */
function sitemapPlugin(siteUrl) {
  return {
    name: 'sitemap-and-robots',
    generateBundle() {
      const urls = Object.values(input)
        .map((file) => relative(import.meta.dirname, file).replaceAll('\\', '/'))
        .filter((rel) => basename(rel) !== '404.html')
        .map((rel) => (rel === 'index.html' ? '/' : `/${rel}`));

      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((url) => `  <url><loc>${siteUrl}${url}</loc></url>`),
        '</urlset>',
        '',
      ].join('\n');

      const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n');

      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
  };
}

export default defineConfig({
  plugins: [partials({ vars: { site: SITE_URL } }), sitemapPlugin(SITE_URL)],
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
    rolldownOptions: { input },
  },
});
