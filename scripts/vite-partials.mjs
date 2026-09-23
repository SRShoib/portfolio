// Local Vite plugin, no dependency. A Vite multi-page app has no way to share HTML
// between pages, so this plugin does it at build time (and on every dev request):
//
//   1. <!--include:header.html-->                     inlines src/partials/header.html
//      <!--include:head.html title="…" description="…"-->
//                                                     …and fills {{title}} / {{description}}
//      <!--include:diagrams/x.svg-->                  works for diagram SVGs the same way,
//                                                     so a card and a case study share markup
//   2. <!--todo-->…<!--/todo-->                       visible placeholder in dev; the whole
//                                                     block is deleted from production HTML
//
// Runs with order:'pre' so Vite still processes the final HTML (asset URLs, module scripts).
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const INCLUDE = /<!--\s*include:([\w./-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g;
const TODO_BLOCK = /<!--todo-->[\s\S]*?<!--\/todo-->/g;

export default function partials({ dir = 'src/partials' } = {}) {
  let root;
  let isBuild = false;

  const expand = (html, page) =>
    html.replace(INCLUDE, (_match, name, attrs) => {
      const vars = Object.fromEntries(
        [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
      let body;
      try {
        body = readFileSync(resolve(root, dir, name), 'utf8');
      } catch {
        throw new Error(`[partials] ${page}: cannot read "${dir}/${name}"`);
      }
      body = body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
      return expand(body, name); // partials may include other partials
    });

  return {
    name: 'local-partials',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const out = expand(html, ctx.filename);
        return isBuild ? out.replace(TODO_BLOCK, '') : out;
      },
    },
    configureServer(server) {
      // Editing a partial changes every page, so reload the whole tab.
      const partialsDir = resolve(root, dir) + sep;
      server.watcher.on('change', (file) => {
        if (resolve(file).startsWith(partialsDir)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
