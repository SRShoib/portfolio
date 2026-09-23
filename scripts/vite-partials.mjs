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
//   3. <!--picture src="/images/a/b.png" alt="…" sizes="…" loading="lazy" class="…"-->
//                                                     expands to a full <picture> (AVIF → WebP → PNG)
//                                                     using the files scripts/optimize-images.mjs
//                                                     wrote next to the PNG. If the PNG does not
//                                                     exist it becomes a TODO block, so a missing
//                                                     screenshot is a dev placeholder and simply
//                                                     absent in production, never a broken image.
//
// Runs with order:'pre' so Vite still processes the final HTML (asset URLs, module scripts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';

const INCLUDE = /<!--\s*include:([\w./-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g;
const PICTURE = /<!--\s*picture((?:\s+[\w-]+="[^"]*")+)\s*-->/g;
const TODO_BLOCK = /<!--todo-->[\s\S]*?<!--\/todo-->/g;

const parseAttrs = (attrs) =>
  Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** Width and height of a PNG, read from its header: 8-byte signature, then the IHDR chunk
 *  (4 length + 4 "IHDR"), then width and height as big-endian uint32 at bytes 16 and 20.
 *  Reading 24 bytes beats a dependency, and the values are exact. */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

export default function partials({ dir = 'src/partials', publicDir = 'public' } = {}) {
  let root;
  let isBuild = false;

  function renderPicture(attrs, page) {
    const { src, alt, sizes = '100vw', loading = 'lazy', fetchpriority, class: cls, todo } = attrs;
    if (!src?.startsWith('/') || !src.toLowerCase().endsWith('.png') || alt === undefined) {
      throw new Error(`[partials] ${page}: <!--picture--> needs src="/….png" and alt="…" (got ${src})`);
    }

    const file = resolve(root, publicDir, src.slice(1));
    if (!existsSync(file)) {
      return `<!--todo--><div class="todo todo--media">TODO: ${todo ?? 'add image'} (${publicDir}${src})</div><!--/todo-->`;
    }

    const { width, height } = pngSize(file);
    const stem = basename(file, '.png');
    const urlDir = dirname(src);

    // Every "<stem>-<width>.avif|webp" beside the PNG, grouped by format, smallest first.
    // (portrait-cutout-480.avif does not match stem "portrait": the part after the dash must be digits.)
    const variants = { avif: [], webp: [] };
    for (const name of readdirSync(dirname(file))) {
      const m = name.match(/^(.+)-(\d+)\.(avif|webp)$/);
      if (m && m[1] === stem) variants[m[3]].push({ w: Number(m[2]), name });
    }

    const sources = ['avif', 'webp']
      .filter((format) => variants[format].length)
      .map((format) => {
        const srcset = variants[format]
          .sort((a, b) => a.w - b.w)
          .map((v) => `${urlDir}/${v.name} ${v.w}w`)
          .join(', ');
        return `<source type="image/${format}" srcset="${srcset}" sizes="${sizes}">`;
      });

    const img = [
      `src="${src}"`,
      `width="${width}"`,
      `height="${height}"`,
      `alt="${alt}"`,
      `loading="${loading}"`,
      'decoding="async"',
      fetchpriority && `fetchpriority="${fetchpriority}"`,
      cls && `class="${cls}"`,
    ]
      .filter(Boolean)
      .join(' ');

    return `<picture>${sources.join('')}<img ${img}></picture>`;
  }

  const expand = (html, page) =>
    html
      .replace(INCLUDE, (_match, name, attrs) => {
        const vars = parseAttrs(attrs);
        let body;
        try {
          body = readFileSync(resolve(root, dir, name), 'utf8');
        } catch {
          throw new Error(`[partials] ${page}: cannot read "${dir}/${name}"`);
        }
        body = body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
        return expand(body, name); // partials may include other partials
      })
      .replace(PICTURE, (_match, attrs) => renderPicture(parseAttrs(attrs), page));

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
