// Turns every PNG under public/images/ into AVIF and WebP files at 2-3 widths, saved next to
// the original:  portrait.png  ->  portrait-480.avif, portrait-480.webp, portrait-928.avif, ...
//
// Why a script and not a Vite plugin: Vite does not process files in public/ (they are copied
// as-is), and the pages reference these files by plain URL. Run automatically by the `predev`
// and `prebuild` npm scripts. The outputs are git-ignored; the PNGs are the source of truth.
//
// The PNG stays as the final <picture> fallback, so nothing here is ever required for a page to
// work: a missing AVIF/WebP only means the browser falls through to the next <source>.
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const IMAGES_DIR = resolve(import.meta.dirname, '../public/images');

// Widths we would like. A width is only made if the source is at least that wide: enlarging a
// screenshot just produces a bigger, blurrier file.
const TARGET_WIDTHS = [480, 960, 1440];
const MAX_WIDTH = TARGET_WIDTHS.at(-1);

// Quality is a size/fidelity trade. AVIF reaches the same look as WebP at a lower number.
const AVIF = { quality: 55, effort: 4 };
const WEBP = { quality: 78, effort: 4 };

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (extname(entry.name).toLowerCase() === '.png') yield path;
  }
}

/** Widths to generate for a source `sourceWidth` px wide: the targets that fit, then the source
 *  width itself (capped at MAX_WIDTH), so there are always at least two sizes for a wide image
 *  and a narrow one (the 928px portrait) still gets its own full-size file. */
export function widthsFor(sourceWidth) {
  const widths = TARGET_WIDTHS.filter((w) => w < sourceWidth);
  widths.push(Math.min(sourceWidth, MAX_WIDTH));
  return [...new Set(widths)];
}

/** True when `output` exists and is at least as new as `source`: nothing to do. */
async function isFresh(output, sourceMtimeMs) {
  try {
    return (await stat(output)).mtimeMs >= sourceMtimeMs;
  } catch {
    return false; // does not exist yet
  }
}

async function optimize(file) {
  const sourceMtimeMs = (await stat(file)).mtimeMs;
  const { width: sourceWidth } = await sharp(file).metadata();
  const stem = join(dirname(file), basename(file, extname(file)));

  let made = 0;
  for (const width of widthsFor(sourceWidth)) {
    for (const [format, options] of [
      ['avif', AVIF],
      ['webp', WEBP],
    ]) {
      const output = `${stem}-${width}.${format}`;
      if (await isFresh(output, sourceMtimeMs)) continue;
      // withoutEnlargement is belt and braces: widthsFor already never asks for more than the source.
      await sharp(file).resize({ width, withoutEnlargement: true })[format](options).toFile(output);
      made += 1;
    }
  }
  return made;
}

async function main() {
  let dirExists = true;
  try {
    await stat(IMAGES_DIR);
  } catch {
    dirExists = false;
  }
  if (!dirExists) {
    console.log('[images] public/images/ does not exist, nothing to do');
    return;
  }

  let sources = 0;
  let made = 0;
  for await (const file of walk(IMAGES_DIR)) {
    sources += 1;
    const count = await optimize(file);
    made += count;
    if (count) console.log(`[images] ${relative(IMAGES_DIR, file)}: wrote ${count} file(s)`);
  }
  console.log(`[images] ${sources} PNG(s) checked, ${made} file(s) written, ${sources ? 'rest up to date' : 'nothing to convert'}`);
}

main().catch((error) => {
  console.error('[images] failed:', error);
  process.exit(1);
});
