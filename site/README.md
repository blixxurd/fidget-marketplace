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
| "Add marketplace" command | `marketplace.repo` (defaults to `blixxurd/fidget-marketplace`) |
| Source link | `source.repo` → `https://github.com/<repo>` |
| Author | `author`, else the GitHub repo owner |
| **Official** badge | `source.repo` owned by the marketplace owner's GitHub handle |

Optional per-plugin fields the build will use if present: `author`, `category`,
`tags` (or `keywords`), `summary`, `homepage`. `category` values automatically
become filter chips on the landing page.

## Deploy (fidget.io)

`vercel.json` configures a static deploy with the project root set to `site/`:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Point the Vercel project's root directory at `site/`, attach the `fidget.io`
domain, and pushes to `main` publish automatically. Any static host works the
same way — build, then serve `dist/`.
