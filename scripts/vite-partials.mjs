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
//                                                     expands to a full <picture> (AVIF → WebP → the
//                                                     original PNG or JPEG) using the files
//                                                     scripts/optimize-images.mjs wrote next to it.
//                                                     If the file does not exist it becomes a TODO
//                                                     block, so a missing screenshot is a dev
//                                                     placeholder and simply absent in production,
//                                                     never a broken image. File names may contain
//                                                     spaces (URLs are percent-encoded). Sources
//                                                     narrower than SMALL_SOURCE_PX get a `data-small`
//                                                     flag so CSS can avoid enlarging them.
//   4. <!--if-image srcs="/a.png,/b.jpg" todo="add images"-->…<!--/if-image-->
//                                                     keeps the block only if at least one of the
//                                                     listed files exists. If none does: one dev-only
//                                                     placeholder, and nothing at all in production
//                                                     (no orphaned caption or credit line). Blocks
//                                                     may nest.
//
// Two phases, because the two kinds of work have opposite needs from Vite. Includes run in Vite's
// `pre` phase, since the head they insert (stylesheet, module scripts) must be processed by Vite.
// Images and TODO blocks run in the `post` phase, after Vite, so Vite cannot rewrite the image URLs
// (it corrupts percent-encoded ones). That is why this file returns two plugins.
import { closeSync, existsSync, openSync, readSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';

const INCLUDE = /<!--\s*include:([\w./-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g;
const PICTURE = /<!--\s*picture((?:\s+[\w-]+="[^"]*")+)\s*-->/g;
// An if-image block whose inner text contains no other if-image opening: i.e. an INNERMOST block.
// expand() applies this repeatedly, so blocks may nest (one per image inside one for the whole figure).
const IF_IMAGE =
  /<!--\s*if-image\s+srcs="([^"]*)"(?:\s+todo="([^"]*)")?\s*-->((?:(?!<!--\s*if-image)[\s\S])*?)<!--\s*\/if-image\s*-->/g;
const TODO_BLOCK = /<!--todo-->[\s\S]*?<!--\/todo-->/g;

// Keep in step with SOURCE_EXTENSIONS in scripts/optimize-images.mjs.
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// A source narrower than this is "small": stretching it to fill a card or a page-wide cover would
// enlarge it well past 1:1 and look soft. The <img> gets a `data-small` flag so CSS can show it
// whole at its own size (object-fit: contain) instead of cropping and upscaling it.
const SMALL_SOURCE_PX = 600;

const parseAttrs = (attrs) =>
  Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** The first `n` bytes of a file. Image sizes live in the header, and the images can be megabytes. */
function readHead(file, n) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, readSync(fd, buf, 0, n, 0));
  } finally {
    closeSync(fd);
  }
}

/** Width and height of a PNG, read from its header: 8-byte signature, then the IHDR chunk
 *  (4 length + 4 "IHDR"), then width and height as big-endian uint32 at bytes 16 and 20.
 *  Reading 24 bytes beats a dependency, and the values are exact. */
function pngSize(head) {
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/** Width and height of a JPEG. A JPEG is a run of segments, each "FF <marker> <2-byte length> data".
 *  The size sits in the "start of frame" segment (markers C0-CF, except C4 = Huffman tables,
 *  C8 = reserved and CC = arithmetic coding): precision (1 byte), then height and width as
 *  big-endian uint16. Everything before it (EXIF, colour profile, thumbnails) is skipped by length.
 *  These are the STORED dimensions; a sideways EXIF orientation is not applied (every image on the
 *  site sits in a frame that crops it, so the attributes only need the right proportions). */
function jpegSize(head) {
  let i = 2; // skip the FF D8 start-of-image marker
  while (i + 9 < head.length) {
    if (head[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = head[i + 1];
    if (marker === 0xff) {
      i += 1; // padding byte
    } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // markers with no length field
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: head.readUInt16BE(i + 5), width: head.readUInt16BE(i + 7) };
    } else {
      i += 2 + head.readUInt16BE(i + 2);
    }
  }
  throw new Error('no start-of-frame segment in the first 256 KB of the JPEG');
}

function imageSize(file) {
  return extname(file).toLowerCase() === '.png' ? pngSize(readHead(file, 24)) : jpegSize(readHead(file, 262144));
}

/** A file path as a URL. Names may contain spaces ("Leaf Crinkle.jpg"), which are invalid in a
 *  `srcset` (it splits candidates on whitespace), so percent-encode them; encodeURI leaves "/" alone.
 *  A comma would also end a srcset candidate, and encodeURI does not touch commas. */
const toUrl = (path) => encodeURI(path).replaceAll(',', '%2C');

export default function partials({ dir = 'src/partials', publicDir = 'public', vars: globalVars = {} } = {}) {
  let root;
  let isBuild = false;

  function renderPicture(attrs, page) {
    const { src, alt, sizes = '100vw', loading = 'lazy', fetchpriority, class: cls, todo } = attrs;
    if (!src?.startsWith('/') || !IMAGE_EXTENSIONS.includes(extname(src).toLowerCase()) || alt === undefined) {
      throw new Error(`[partials] ${page}: <!--picture--> needs src="/….png|.jpg|.jpeg" and alt="…" (got ${src})`);
    }

    const file = resolve(root, publicDir, src.slice(1));
    if (!existsSync(file)) {
      return `<!--todo--><div class="todo todo--media">TODO: ${todo ?? 'add image'} (${publicDir}${src})</div><!--/todo-->`;
    }

    const { width, height } = imageSize(file);
    const stem = basename(file, extname(file));
    const urlDir = dirname(src);

    // Every "<stem>-<width>.avif|webp" beside the original, grouped by format, smallest first.
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
          .map((v) => `${toUrl(`${urlDir}/${v.name}`)} ${v.w}w`)
          .join(', ');
        return `<source type="image/${format}" srcset="${srcset}" sizes="${sizes}">`;
      });

    const img = [
      `src="${toUrl(src)}"`,
      `width="${width}"`,
      `height="${height}"`,
      `alt="${alt}"`,
      `loading="${loading}"`,
      'decoding="async"',
      fetchpriority && `fetchpriority="${fetchpriority}"`,
      cls && `class="${cls}"`,
      width < SMALL_SOURCE_PX && 'data-small',
    ]
      .filter(Boolean)
      .join(' ');

    return `<picture>${sources.join('')}<img ${img}></picture>`;
  }

  // Keep-or-drop every if-image block, innermost first, until none is left (so they can nest).
  const expandIfImage = (html) => {
    let out = html;
    let before;
    do {
      before = out;
      out = out.replace(IF_IMAGE, (_match, srcs, todo, inner) => {
        const list = srcs.split(',').map((s) => s.trim()).filter(Boolean);
        const any = list.some((src) => existsSync(resolve(root, publicDir, src.replace(/^\//, ''))));
        if (any) return inner;
        return `<!--todo--><div class="todo">TODO: ${todo ?? 'add images'} (${list.map((s) => publicDir + s).join(', ')})</div><!--/todo-->`;
      });
    } while (out !== before);
    return out;
  };

  // PHASE 1 (pre): shared HTML. Must run before Vite, because the included head has the stylesheet
  // and module-script tags that Vite bundles and rewrites.
  //
  // `globalVars` (e.g. { site: SITE_URL }) are available to every include; a page's own attributes
  // (title, description, path, …) are layered on top and win on a name clash. A template variable
  // with no value anywhere throws instead of silently becoming "": M8 added {{site}}{{path}} to
  // head.html for canonical/og:url, and a page that forgot `path="…"` would otherwise get a
  // canonical URL silently equal to "" + SITE_URL, wrong but not visibly broken.
  const expandIncludes = (html, page) =>
    html.replace(INCLUDE, (_match, name, attrs) => {
      const vars = { ...globalVars, ...parseAttrs(attrs) };
      let body;
      try {
        body = readFileSync(resolve(root, dir, name), 'utf8');
      } catch {
        throw new Error(`[partials] ${page}: cannot read "${dir}/${name}"`);
      }
      body = body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key) => {
        if (!(key in vars)) throw new Error(`[partials] ${page}: include:${name} uses {{${key}}}, but no such attribute was passed`);
        return vars[key];
      });
      return expandIncludes(body, name); // partials may include other partials
    });

  // PHASE 2 (post): images and TODO blocks. Runs AFTER Vite has finished with the HTML, on purpose:
  // Vite rewrites image URLs it finds in the page (it decodes a src and double-encodes a srcset, so
  // "Leaf%20Crinkle-480.avif" became "Leaf%2520Crinkle-480.avif", a file that does not exist). These URLs
  // are already final, so Vite must never see them. if-image runs BEFORE picture, so the pictures in a
  // block that is kept still get expanded (and the ones in a dropped block never are).
  const expandImages = (html, page) =>
    expandIfImage(html).replace(PICTURE, (_match, attrs) => renderPicture(parseAttrs(attrs), page));

  return [
    {
      name: 'local-partials',
      configResolved(config) {
        root = config.root;
        isBuild = config.command === 'build';
      },
      transformIndexHtml: {
        order: 'pre',
        handler: (html, ctx) => expandIncludes(html, ctx.filename),
      },
      configureServer(server) {
        // Editing a partial changes every page, so reload the whole tab.
        const partialsDir = resolve(root, dir) + sep;
        server.watcher.on('change', (file) => {
          if (resolve(file).startsWith(partialsDir)) server.ws.send({ type: 'full-reload' });
        });
      },
    },
    {
      name: 'local-partials:images',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const out = expandImages(html, ctx.filename);
          // Production: delete every TODO block, including the ones made just above for missing images.
          return isBuild ? out.replace(TODO_BLOCK, '') : out;
        },
      },
    },
  ];
}
