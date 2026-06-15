# fidget.io — marketplace site

The public marketing/browse site for the fidget marketplace, deployed to
**fidget.io**. It is a fully static site with **no runtime dependencies** — the
build step compiles the marketplace catalog into HTML.

## How it works

The single source of truth is [`../.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json).
`scripts/build.mjs` reads that catalog and generates the whole site into `dist/`:

```
dist/
  index.html                     # landing + searchable plugin grid
  plugins/<slug>/index.html      # one detail page per plugin
  marketplace.json               # the catalog, republished as-is
  styles.css, app.js, favicon.svg
  sitemap.xml, robots.txt
```

Nothing about a plugin is hand-written into HTML. Add a plugin to
`marketplace.json`, rebuild, and it appears on the site — name, author, source
link, and the copy-paste `/plugin install <name>@fidget` command are all derived.

## Commands

```bash
cd site
npm run build     # compile marketplace.json -> dist/
npm run dev       # build, then serve dist/ at http://localhost:4321
npm run serve     # serve an existing dist/ build
```

No `npm install` is needed — the build and dev server use only Node's standard
library (Node 18+).

## Derived fields

The catalog is intentionally minimal; the build derives the rest:

| Site element | Derived from |
|---|---|
| Install command | `/plugin install <name>@<marketplace.name>` |
| "Add marketplace" command | the published catalog URL (`<SITE_URL>/marketplace.json`) |
| Source link | `source.repo` → `https://github.com/<repo>` |
| Author | `author`, else the GitHub repo owner |
| **Official** badge | `source.repo` owned by the marketplace owner's GitHub handle |

Optional per-plugin fields the build will use if present: `author`, `category`,
`tags` (or `keywords`), `summary`, `homepage`. `category` values automatically
become filter chips on the landing page.

## Deploy (fidget.io)

The site is plain static files, so any host works — build, then serve `dist/`.
Two ready-to-go paths:

### GitHub Pages (default)

[`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml)
builds the site and publishes it to Pages on every push to `main` that touches
`site/` or the catalog. The build emits a `CNAME` (`fidget.io`) and `.nojekyll`
into `dist/`, so the custom domain stays bound and Pages serves the files as-is.

One-time setup:

1. **Repo → Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Pages → Custom domain:** `fidget.io` (then enable *Enforce HTTPS*).
3. **DNS** at your registrar — point the apex at GitHub Pages:
   - `A` records for `fidget.io` → `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
   - (optional) `CNAME` for `www` → `blixxurd.github.io`

> Because the site uses absolute paths (`/styles.css`, `/about/`), it must be
> served from a domain **root** — the custom domain (or `blixxurd.github.io`),
> not a project subpath like `blixxurd.github.io/fidget-marketplace/`.

### Vercel (alternative)

[`vercel.json`](vercel.json) sets build command `npm run build` and output
`dist`. Point the project's root directory at `site/`, attach `fidget.io`, and
pushes to `main` publish automatically. (The `CNAME`/`.nojekyll` files are
harmless here — Vercel ignores them.)
