# Locent website

The public site for Locent, an offline-first expense tracker for Android: a homepage, a
privacy policy and terms of service. Google's OAuth consent screen requires all three, on
one domain, before the app's `drive.appdata` scope can be verified.

Static HTML, no framework, no runtime JavaScript beyond the theme switch.

## Develop

```bash
npm install
npm run dev      # rebuild the stylesheet on change
npm run serve    # build dist/ and serve it
npm run verify   # run the checks CI runs
```

`assets/css/site.css` and `assets/fonts/` are generated, not committed — the build
produces them. Run `npm run dev` before opening pages locally, or they render unstyled.

`npm run verify` drives a headless Chromium and downloads one on first use; set
`CHROMIUM_PATH` to reuse an existing browser.

## Theming

Tokens in `src/input.css` mirror the app's, and follow the same rule: every colour is a
`--color-*` variable defined identically in light and dark, so markup uses semantic
classes (`bg-background`, `text-muted`) and never `dark:` prefixes. Dark mode re-points
the variables under `[data-theme='dark']`. If the app's tokens change, update this file.

Spline Sans is self-hosted, so the site makes no third-party request — a page arguing that
Locent sends nothing to anyone should not hand every visitor's IP to a CDN to say so. The
build copies it from the pinned `@fontsource-variable/spline-sans`.

## Pipeline

`.github/workflows/pages.yml` builds `dist/`, verifies it, and publishes to Pages. Pull
requests build and verify but never deploy.

The verify step loads each page and fails on: broken links, dead anchors or 404ing assets;
root-relative paths, which work locally but 404 under the project-site prefix; a wrong
`canonical` or `og:image`; any third-party request; the homepage losing its link to either
policy page; layout overflow; or theme tokens not applying, which is what a stale
stylesheet looks like from outside.

**Settings → Pages → Source must be "GitHub Actions"** — the stylesheet is not committed,
so serving the branch directly would publish an unstyled site.

## Google OAuth verification

The site is a GitHub Pages project site, published at
`https://faizan2515.github.io/locent-website/`.

| Consent screen field | URL                    |
| -------------------- | ---------------------- |
| Application homepage | the site root          |
| Privacy policy       | `…/privacy.html`       |
| Terms of service     | `…/terms.html`         |

Because `github.io` is a public suffix, the Pages host counts as its own domain and must
be verified before it can be added under *Authorized domains*. Use
[Search Console](https://search.google.com/search-console) with a **URL-prefix** property
and the HTML-file method — commit the `google*.html` file to the repo root and Pages
serves it. The *Domain* property type is DNS-based and cannot work here.

To move to a custom domain later: point it at Pages, add a `CNAME`, and update the
canonical/`og:` tags, `robots.txt` and `sitemap.xml`. Every path in the HTML is relative,
so the pages themselves need no changes.
