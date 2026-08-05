/*
 * Post-build checks against the assembled dist/.
 *
 * These guard the things that actually break this site: a stale stylesheet, a
 * link typo in a legal page, a root-relative path that works locally but 404s
 * under the /locent-website/ project-site prefix, and — because the whole point
 * of the site is Google OAuth verification — the homepage silently losing its
 * links to the policy pages.
 *
 * Usage: node scripts/verify-site.mjs [dist-dir]
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, process.argv[2] ?? 'dist');

const PAGES = ['index.html', 'privacy.html', 'terms.html'];
const WIDTHS = [320, 390, 768, 1280];
const BASE_URL = 'https://faizan2515.github.io/locent-website/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const failures = [];
const fail = (message) => failures.push(message);

/* Minimal static server so the checks run against real HTTP, not file://,
   which browsers treat differently for scripts and localStorage. */
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(dist, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}/`;

/* CI installs a matching browser via `playwright install`. CHROMIUM_PATH lets
   environments that already ship one (self-hosted runners, nix, distro
   packages) point at it instead of downloading a second copy. */
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();

page.on('pageerror', (error) => fail(`uncaught page error: ${error.message}`));

/* The site argues that Locent sends nothing to anyone, so the pages hosting
   that argument must not quietly call out to a CDN either. Every asset is
   same-origin; anything else is a regression. */
page.on('request', (request) => {
  const url = request.url();
  if (!url.startsWith(origin) && !url.startsWith('data:')) {
    fail(`third-party request: ${url}`);
  }
});

for (const name of PAGES) {
  await page.goto(origin + name, { waitUntil: 'load' });

  const found = await page.evaluate(() => {
    const rootRelative = [];
    const anchors = [];
    const internal = [];
    const assets = [];

    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (href.startsWith('/')) rootRelative.push(`a[href="${href}"]`);
      else if (href.startsWith('#')) anchors.push(href);
      else if (!href.startsWith('http') && !href.startsWith('mailto:')) internal.push(a.href);
    }

    for (const el of document.querySelectorAll('img[src], script[src], link[href]')) {
      const attr = el.tagName === 'LINK' ? 'href' : 'src';
      const value = el.getAttribute(attr);
      if (value.startsWith('/')) rootRelative.push(`${el.tagName.toLowerCase()}[${attr}="${value}"]`);
      const resolved = el.src || el.href;
      if (resolved?.startsWith(location.origin)) assets.push(resolved);
    }

    const meta = (selector) => document.querySelector(selector)?.content ?? null;
    return {
      rootRelative,
      deadAnchors: anchors.filter((a) => !document.querySelector(a)),
      internal,
      assets,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ogImage: meta('meta[property="og:image"]'),
      ogTitle: meta('meta[property="og:title"]'),
      title: document.title,
      linksToPrivacy: !!document.querySelector('a[href$="privacy.html"]'),
      linksToTerms: !!document.querySelector('a[href$="terms.html"]'),
    };
  });

  /* A path starting with "/" resolves to the domain root, which is not where a
     project site lives — these 404 in production while passing locally. */
  for (const selector of found.rootRelative) {
    fail(`${name}: root-relative path breaks the /locent-website/ prefix — ${selector}`);
  }
  for (const anchor of found.deadAnchors) fail(`${name}: anchor has no target — ${anchor}`);

  for (const url of [...found.internal, ...found.assets]) {
    const response = await page.request.get(url);
    if (!response.ok()) fail(`${name}: ${response.status()} for ${url.replace(origin, '')}`);
  }

  if (!found.title) fail(`${name}: missing <title>`);
  if (!found.ogTitle) fail(`${name}: missing og:title`);
  if (found.canonical !== `${BASE_URL}${name === 'index.html' ? '' : name}`) {
    fail(`${name}: canonical is ${found.canonical}`);
  }

  /* og:image is declared as an absolute production URL, so check the file it
     points at exists in this build rather than fetching over the network. */
  if (!found.ogImage?.startsWith(BASE_URL)) {
    fail(`${name}: og:image is not an absolute ${BASE_URL} URL — ${found.ogImage}`);
  } else {
    const response = await page.request.get(found.ogImage.replace(BASE_URL, origin));
    if (!response.ok()) fail(`${name}: og:image missing from build (${response.status()})`);
  }

  /* Google's OAuth consent screen review expects the homepage to reach both
     policy documents. Losing these links is the one regression that would pass
     every other check and still sink verification. */
  if (name === 'index.html') {
    if (!found.linksToPrivacy) fail('index.html: homepage has no link to privacy.html');
    if (!found.linksToTerms) fail('index.html: homepage has no link to terms.html');
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    if (overflow.scroll > overflow.inner + 1) {
      fail(`${name}: horizontal overflow at ${width}px (${overflow.scroll} > ${overflow.inner})`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

/*
 * Search Console tokens must keep serving after verification succeeds — Google
 * re-checks them, and losing one un-verifies the domain, which would in turn
 * invalidate it as an authorised domain on the OAuth consent screen. Assert
 * every token in the repo root is actually reachable in the build.
 */
for (const token of (await readdir(root)).filter((f) => /^google[0-9a-f]+\.html$/.test(f))) {
  const response = await page.request.get(origin + token);
  if (!response.ok()) {
    fail(`${token}: Search Console token not served from the build (${response.status()})`);
    continue;
  }
  const served = (await response.text()).trim();
  const onDisk = (await readFile(join(root, token), 'utf8')).trim();
  if (served !== onDisk) fail(`${token}: served content does not match the repo root copy`);
}

/* The stylesheet is generated, so verify a token-driven rule actually applied —
   this is what catches a dist/ built from a stale or empty CSS file. */
await page.goto(origin, { waitUntil: 'load' });
const themes = await page.evaluate(async () => {
  const read = () => getComputedStyle(document.body).backgroundColor;
  const out = { initial: read() };
  document.querySelector('[data-theme-value="dark"]').click();
  out.dark = read();
  document.querySelector('[data-theme-value="light"]').click();
  out.light = read();
  return out;
});
if (themes.dark !== 'rgb(0, 0, 0)') fail(`dark theme background is ${themes.dark}, expected #000`);
if (themes.light !== 'rgb(255, 255, 255)') fail(`light theme background is ${themes.light}, expected #fff`);

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(
  `All checks passed — ${PAGES.length} pages, links/anchors/assets resolve, ` +
    `no overflow at ${WIDTHS.join('/')}px, themes apply.`,
);
