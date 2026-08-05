/*
 * Assemble the deployable site into dist/.
 *
 * Everything that ships is copied verbatim except the stylesheet, which is
 * compiled from src/input.css by `npm run build` before this runs. Keeping the
 * publish directory separate from the repo root means the Pages artifact never
 * carries node_modules, sources or CI scripts.
 */
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/* Files that make up the published site. */
const FILES = ['index.html', 'privacy.html', 'terms.html', 'robots.txt', 'sitemap.xml'];
const DIRS = ['assets'];

/*
 * Spline Sans is self-hosted rather than loaded from Google's CDN: a site whose
 * argument is that nothing reaches anyone should not hand every visitor's IP to
 * a third party. The files come from the pinned @fontsource-variable package and
 * are copied into assets/fonts/ (gitignored) so the source tree and dist/ agree
 * on paths. One variable file per subset covers weights 300-700.
 */
const FONT_SRC = join(root, 'node_modules/@fontsource-variable/spline-sans/files');
const FONTS = [
  ['spline-sans-latin-wght-normal.woff2', 'spline-sans-latin.woff2'],
  ['spline-sans-latin-ext-wght-normal.woff2', 'spline-sans-latin-ext.woff2'],
];

await mkdir(join(root, 'assets/fonts'), { recursive: true });
for (const [from, to] of FONTS) {
  try {
    await cp(join(FONT_SRC, from), join(root, 'assets/fonts', to));
  } catch {
    console.error(`Missing ${from} — run \`npm install\` to restore the font package.`);
    process.exit(1);
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of FILES) {
  await cp(join(root, file), join(dist, file));
}

for (const dir of DIRS) {
  await cp(join(root, dir), join(dist, dir), { recursive: true });
}

/* Without this, Pages runs the output through Jekyll, which drops paths that
   start with an underscore and slows every deploy down for no benefit. */
await writeFile(join(dist, '.nojekyll'), '');

/* The stylesheet is generated, so a missing one means `npm run build` did not
   run — fail here rather than shipping a site with no styles. */
try {
  await access(join(dist, 'assets/css/site.css'));
} catch {
  console.error('dist/assets/css/site.css is missing — run `npm run build` first.');
  process.exit(1);
}

console.log(`Built dist/ (${FILES.length + DIRS.length} entries + .nojekyll)`);
