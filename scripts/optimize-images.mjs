// Turns every PNG and JPEG under public/images/ into AVIF and WebP files at 2-3 widths, saved next
// to the original:  portrait.png  ->  portrait-480.avif, portrait-480.webp, portrait-928.avif, ...
//
// Why a script and not a Vite plugin: Vite does not process files in public/ (they are copied
// as-is), and the pages reference these files by plain URL. Run automatically by the `predev`
// and `prebuild` npm scripts. The outputs are git-ignored; the originals are the source of truth.
//
// The original (PNG or JPEG) stays as the final <picture> fallback, so nothing here is ever required
// for a page to work: a missing AVIF/WebP only means the browser falls through to the next <source>.
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

// Keep in step with IMAGE_EXTENSIONS in vite-partials.mjs (the plugin must accept what this converts).
const SOURCE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// M8: JSON-LD's `image` (CLAUDE.md, Portrait in About / SEO) needs a square crop; portrait.png is
// 928x1065 (portrait orientation). This is generated here, not by hand, so it stays in sync with
// portrait.png automatically (same freshness check as every other output below).
const PORTRAIT_SQUARE = {
  source: join(IMAGES_DIR, 'profile', 'portrait.png'),
  output: join(IMAGES_DIR, 'profile', 'portrait-square.jpg'),
};

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_EXTENSIONS.includes(extname(entry.name).toLowerCase())) yield path;
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
  const { width: rawWidth, height: rawHeight, orientation = 1 } = await sharp(file).metadata();
  // EXIF orientation 5-8 means the photo is stored sideways: what people SEE is width and height swapped.
  const sourceWidth = orientation >= 5 ? rawHeight : rawWidth;
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
      // .rotate() with no argument applies the EXIF orientation. sharp drops the tag from its output, so
      // without it a phone photo taken sideways would come out sideways in AVIF/WebP while the original
      // JPEG fallback (which browsers do rotate) looked right: two different pictures in one <picture>.
      await sharp(file).rotate().resize({ width, withoutEnlargement: true })[format](options).toFile(output);
      made += 1;
    }
  }
  return made;
}

/** Square, top-aligned crop of the portrait (928x928 from 928x1065): the same top-anchored framing
 *  base.css already gives the About portrait (`object-position: top`), since a face sits near the
 *  top of a headshot. `fit: cover` with `position: 'top'` crops the excess off the bottom only. */
async function buildPortraitSquare() {
  const sourceMtimeMs = (await stat(PORTRAIT_SQUARE.source)).mtimeMs;
  if (await isFresh(PORTRAIT_SQUARE.output, sourceMtimeMs)) return false;
  const { width } = await sharp(PORTRAIT_SQUARE.source).metadata();
  await sharp(PORTRAIT_SQUARE.source)
    .resize({ width, height: width, fit: 'cover', position: 'top' })
    .flatten({ background: '#0f0e0c' }) // in case the source PNG has any transparent edge
    .jpeg({ quality: 82 })
    .toFile(PORTRAIT_SQUARE.output);
  return true;
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
    if (file === PORTRAIT_SQUARE.output) continue; // a derived file, never its own source
    sources += 1;
    const count = await optimize(file);
    made += count;
    if (count) console.log(`[images] ${relative(IMAGES_DIR, file)}: wrote ${count} file(s)`);
  }
  console.log(`[images] ${sources} image(s) checked, ${made} file(s) written, ${sources ? 'rest up to date' : 'nothing to convert'}`);

  try {
    if (await buildPortraitSquare()) console.log('[images] profile/portrait-square.jpg: wrote 1 file');
  } catch {
    console.log('[images] profile/portrait.png not found, skipped the square crop (JSON-LD image)');
  }
}

main().catch((error) => {
  console.error('[images] failed:', error);
  process.exit(1);
});
