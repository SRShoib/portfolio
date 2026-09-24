// Size budgets for the built site. Run automatically after every `npm run build` (the `postbuild`
// npm script) and FAILS the build, with a non-zero exit code, if the home page's JavaScript is
// over either of two independent budgets:
//
//     total    home-page JS <= 300 KB gzipped, INCLUDING the lazy-loaded three.js chunk (CLAUDE.md, "Performance budget")
//     initial  home-page JS <= 100 KB gzipped, EXCLUDING lazy chunks: what must download before the page works
//
// Why two? The total stops the site growing without limit; the initial limit protects load time. They
// catch different mistakes: importing three.js statically instead of lazily moves ~134 KB from "lazy" to
// "initial" and barely changes the total (it passes the 300 KB budget), so only the initial limit sees it.
//
// Read it as a checklist of decisions, because each one changes what the number means:
//
//  * "Home-page JS" = every JS chunk the built dist/index.html can reach: the entry scripts, the
//    chunks they import statically, and the chunks they only import() lazily (three.js), plus any
//    inline <script> in the HTML. The lazy chunk is counted in the total on purpose: it is not on the
//    critical path, but it is still a download the visitor pays for, and the budget says "including three.js".
//  * "Initial" = the entry scripts, everything they import statically, and inline scripts (all of which
//    run before the page is interactive). Anything reached only through import() is lazy.
//  * Chunks are found by the file names the built pages and chunks mention, never by hard-coded names
//    (the hashes change on every build). A chunk name is unique, so if any file loads a chunk,
//    however Vite chooses to write the import, its name appears in that file's text.
//  * Sizes are gzip at zlib's default level (6), reproducible with any standard tool (`gzip -6`).
//    Vite's own build log uses a different compressor and reads about 1% HIGHER (measured: 54.77 vs
//    54.33 KB for the shared chunk, 134.25 vs 133.33 KB for three.js), and no zlib level reproduces its
//    figures. So the two will not match exactly; THIS report is the number the budget is enforced against.
//    Real servers usually send brotli, which is smaller still (about 16% here), so gzip is the cautious choice.
//    1 KB = 1000 bytes (Vite's convention too), slightly stricter than 1024, the safe direction for a budget.
//  * Any chunk in dist/assets that NO page reaches fails the build too. If this script ever stopped
//    seeing a chunk (a new way of loading code), the total would silently shrink and the budget would
//    pass while meaning nothing; an unreachable chunk is how that shows up.
//
// Only runs through `npm run build` (npm runs the `postbuild` hook); a bare `vite build` skips it.
//
// Testing the checks themselves: `node scripts/size-report.mjs --budget=150 --initial-budget=50` runs
// them against the current dist/ with different limits, so you can watch each one fail without
// touching the code. (Both flags are optional; npm's postbuild passes neither.)

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_BUDGET_KB = 300;
const INITIAL_BUDGET_KB = 100;
const KB = 1000;
const DIST = join(import.meta.dirname, '..', 'dist');
const HOME = 'index.html';

/** The limit in KB from a `--flag=N` argument, or `fallback`. Exits with a message on a bad value. */
function readLimit(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return fallback;
  const value = Number(arg.slice(flag.length + 1));
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[size] invalid ${arg}: expected a positive number of KB, e.g. ${flag}=${fallback}`);
    process.exit(1);
  }
  return value;
}
const totalKb = readLimit('--budget', TOTAL_BUDGET_KB);
const initialKb = readLimit('--initial-budget', INITIAL_BUDGET_KB);
// Rounded because a decimal limit can pick up floating-point noise (1.005 * 1000 is 1004.9999999999999).
const totalBytes = Math.round(totalKb * KB);
const initialBytes = Math.round(initialKb * KB);

const kb = (bytes) => `${(bytes / KB).toFixed(2)} KB`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fail(message) {
  console.error(`\n[size] FAIL: ${message}\n`);
  process.exit(1);
}

// ---- Read dist/ --------------------------------------------------------------------------
let assetNames;
try {
  assetNames = readdirSync(join(DIST, 'assets')).filter((name) => name.endsWith('.js'));
} catch {
  fail('dist/assets not found. Run the build first (npm run build).');
}

// name -> { name, code, raw bytes, gzip bytes }
const chunks = new Map(
  assetNames.map((name) => {
    const buffer = readFileSync(join(DIST, 'assets', name));
    return [name, { name, code: buffer.toString('utf8'), raw: buffer.length, gzip: gzipSync(buffer).length }];
  }),
);

/** Every .html page under dist/, as paths relative to dist/ ("index.html", "projects/x.html"). */
function findPages(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : findPages(path);
    return entry.name.endsWith('.html') ? [relative(DIST, path).replaceAll('\\', '/')] : [];
  });
}

// ---- Work out what a page loads ---------------------------------------------------------
/** Names of the chunks whose file name appears in `text`, skipping `self`. */
const mentioned = (text, self) => [...chunks.keys()].filter((name) => name !== self && text.includes(name));

/** True if `code` pulls `name` in with a STATIC import/export-from (which downloads it up front). */
const importsStatically = (code, name) =>
  new RegExp(`(?:\\bfrom|\\bimport)\\s*["'\`]\\./${escapeRegExp(name)}["'\`]`).test(code);

/** Everything reachable from `starts`, following `next(name)`. */
function closure(starts, next) {
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    for (const name of next(queue.pop())) {
      if (!seen.has(name)) {
        seen.add(name);
        queue.push(name);
      }
    }
  }
  return seen;
}

function analysePage(page) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const entries = mentioned(html, null);

  // initial: the entries plus whatever they import statically; lazy: reached only through import().
  const initial = closure(entries, (name) =>
    mentioned(chunks.get(name).code, name).filter((other) => importsStatically(chunks.get(name).code, other)),
  );
  const reached = closure(entries, (name) => mentioned(chunks.get(name).code, name));
  const lazy = [...reached].filter((name) => !initial.has(name));

  // Inline <script> code counts too (the tiny head script today). JSON-LD and other data blocks are not JS.
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs))
    .filter(([, attrs]) => !/\btype\s*=\s*["']?(?!module|text\/javascript)/i.test(attrs))
    .map(([, , body]) => body)
    .filter((body) => body.trim());
  const inlineGzip = inline.reduce((sum, body) => sum + gzipSync(body).length, 0);

  const files = [
    ...[...initial].map((name) => ({ name, kind: 'initial' })),
    ...lazy.map((name) => ({ name, kind: 'lazy' })),
  ].map((file) => ({ ...file, ...chunks.get(file.name) }));
  if (inline.length) {
    files.push({
      name: `${inline.length} inline script${inline.length > 1 ? 's' : ''}`,
      kind: 'inline',
      gzip: inlineGzip,
      raw: inline.join('').length,
    });
  }

  // Inline scripts run before anything else, so they belong to the "initial" figure.
  const sizeOf = (...kinds) => files.filter((file) => kinds.includes(file.kind)).reduce((sum, file) => sum + file.gzip, 0);
  return {
    page,
    files,
    initialTotal: sizeOf('initial', 'inline'),
    lazyTotal: sizeOf('lazy'),
    total: sizeOf('initial', 'inline', 'lazy'),
    reached,
  };
}

const pages = findPages();
if (!pages.includes(HOME)) fail(`dist/${HOME} not found. Run the build first (npm run build).`);
const analysed = pages.map(analysePage);
const home = analysed.find((result) => result.page === HOME);

// A home page with no JS at all means this script failed to find it, not that the site is tiny.
if (!home.files.some((file) => file.kind !== 'inline')) {
  fail(`found no JavaScript chunks for ${HOME}: the report can't be trusted. Has the build output format changed?`);
}

// ---- Report -----------------------------------------------------------------------------
const pad = (text, width) => String(text).padEnd(width);
const nameWidth = Math.max(...home.files.map((file) => file.name.length));
const percent = (bytes, limit) => Math.round((bytes / limit) * 100);

console.log(`\n[size] JavaScript, gzip -6 (1 KB = 1000 bytes; Vite's log above reads ~1% higher, this is the budgeted figure)\n`);
console.log(`  Home page (${HOME})`);
for (const file of home.files) {
  console.log(`    ${pad(file.kind, 8)} ${pad(file.name, nameWidth)}  ${kb(file.gzip).padStart(10)}   (${kb(file.raw)} minified)`);
}
console.log(`    ${'-'.repeat(8 + 1 + nameWidth + 2 + 10)}`);
const summary = (label, bytes, note = '') =>
  console.log(`    ${pad(label, 8)} ${pad('', nameWidth)}  ${kb(bytes).padStart(10)}   ${note}`);
summary('initial', home.initialTotal, `${percent(home.initialTotal, initialBytes)}% of the ${initialKb} KB initial budget (no lazy chunks)`);
summary('lazy', home.lazyTotal, 'loaded on demand, after first paint');
summary('total', home.total, `${percent(home.total, totalBytes)}% of the ${totalKb} KB total budget`);

const others = analysed.filter((result) => result !== home);
if (others.length) {
  console.log(`\n  Other pages (no budget, for information)`);
  const width = Math.max(...others.map((result) => result.page.length));
  for (const result of others) console.log(`    ${pad(result.page, width)}  ${kb(result.total).padStart(10)}`);
}

// ---- Checks -----------------------------------------------------------------------------
// Every check adds to `problems` instead of exiting, so one run reports everything that is wrong.
const problems = [];

// 1. Every chunk must be reachable from some page (see the header comment for why).
const reachable = new Set(analysed.flatMap((result) => [...result.reached]));
const orphans = [...chunks.keys()].filter((name) => !reachable.has(name));
if (orphans.length) {
  problems.push(`these chunks in dist/assets are not reachable from any page, so their size is not being counted: ${orphans.join(', ')}`);
}

// 2. Initial JS. Compared in bytes, so 100.004 KB does not slip through as "100.00".
if (home.initialTotal > initialBytes) {
  const biggest = home.files.filter((file) => file.kind === 'initial').sort((a, b) => b.gzip - a.gzip)[0];
  problems.push(
    `initial (non-lazy) home-page JS is ${kb(home.initialTotal)} gzipped (${home.initialTotal} bytes), over the ${initialKb} KB initial budget ` +
      `(${initialBytes} bytes) by ${kb(home.initialTotal - initialBytes)}. Biggest initial chunk: ${biggest.name} at ${kb(biggest.gzip)}. ` +
      `Move code behind a dynamic import() or drop it.`,
  );
}

// 3. Total JS, lazy chunks included.
if (home.total > totalBytes) {
  const biggest = home.files.filter((file) => file.kind !== 'inline').sort((a, b) => b.gzip - a.gzip)[0];
  problems.push(
    `total home-page JS is ${kb(home.total)} gzipped (${home.total} bytes), over the ${totalKb} KB total budget ` +
      `(${totalBytes} bytes) by ${kb(home.total - totalBytes)}. Biggest chunk: ${biggest.name} at ${kb(biggest.gzip)}.`,
  );
}

if (problems.length) {
  console.error(`\n[size] FAIL: ${problems.length} problem${problems.length > 1 ? 's' : ''}`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `\n[size] OK: within both budgets. Initial ${kb(initialBytes - home.initialTotal)} to spare, total ${kb(totalBytes - home.total)} to spare.\n`,
);
