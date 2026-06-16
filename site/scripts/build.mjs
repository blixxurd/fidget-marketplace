#!/usr/bin/env node
// Build the fidget.io marketplace site.
//
// This is the "compile" step: it reads the single source of truth —
// ../.claude-plugin/marketplace.json — and emits a fully static site into
// site/dist/. No data is hand-written into HTML; everything below is derived
// from the catalog so the website can never drift from the marketplace.

import { readFile, writeFile, mkdir, rm, cp, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(__dirname, "..");
const ROOT_DIR = resolve(SITE_DIR, "..");
const CATALOG_PATH = join(ROOT_DIR, ".claude-plugin", "marketplace.json");
const ASSETS_DIR = join(SITE_DIR, "assets");
const DIST_DIR = join(SITE_DIR, "dist");

// Absolute origin used for canonical/OG/sitemap URLs.
const SITE_URL = (process.env.SITE_URL || "https://fidget.io").replace(/\/$/, "");
// Path prefix when the site is NOT served from a domain root — e.g. a GitHub
// Pages project URL at /<repo>/. Empty for the custom domain. All internal
// links and asset refs go through href() so this is the only knob.
const BASE = (process.env.BASE_PATH || "").replace(/\/$/, "");
// Custom domain served from GitHub Pages, emitted as the CNAME file so Pages
// keeps the domain bound. Only emitted for a root deploy (BASE empty), so test
// builds on a project subpath don't hijack an unconfigured domain.
const SITE_DOMAIN = "fidget.io";
// Set true to publish the About page (nav link, generated page, sitemap entry).
// Hidden for now; the aboutPage() source stays intact so this is a one-line flip.
const SHOW_ABOUT = false;

/** Prefix a root-relative path with the base path (if any). */
function href(path) {
  return BASE + path;
}

// Content-hash query strings for cached assets, filled in during build() so a
// changed stylesheet/script busts the browser + CDN cache instead of going
// stale behind /styles.css and /app.js.
const assetV = { css: "", js: "" };
function hash8(buf) {
  return createHash("sha1").update(buf).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Escape text for safe interpolation into HTML element/attribute content. */
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Derive a normalized view-model from the raw catalog entry
// ---------------------------------------------------------------------------

/**
 * The catalog is intentionally minimal. We derive everything the site needs
 * (slugs, source URLs, install commands, trust signals) so authors only ever
 * edit marketplace.json.
 */
function normalize(catalog) {
  const marketplaceName = catalog.name || "fidget";
  const ownerName = catalog.owner?.name || "";
  const ownerUrl = catalog.owner?.url || "";
  // GitHub handle that owns the marketplace, used to flag "official" plugins.
  const ownerHandle = ownerUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "").toLowerCase();
  // Public URL of the catalog the build republishes (dist/marketplace.json).
  // `/plugin marketplace add` accepts a direct HTTPS URL to a marketplace.json,
  // so we point users at the domain rather than the GitHub repo slug.
  const marketplaceUrl = `${SITE_URL}${BASE}/marketplace.json`;

  const plugins = (catalog.plugins || []).map((p) => {
    const repo = p.source?.repo || "";
    const sourceUrl = repo ? `https://github.com/${repo}` : (p.homepage || "");
    const author = p.author || repo.split("/")[0] || ownerName;
    const isOfficial =
      !!ownerHandle && repo.toLowerCase().startsWith(ownerHandle + "/");
    // Tags: explicit `tags`/`keywords` if the author provides them, else none.
    const tags = (p.tags || p.keywords || []).filter(Boolean);
    return {
      name: p.name,
      slug: slugify(p.name),
      description: p.description || "",
      summary: p.summary || firstSentence(p.description || ""),
      category: p.category || "",
      tags,
      license: p.license || "",
      repo,
      sourceUrl,
      author,
      isOfficial,
      // Optional per-plugin usage steps (array of strings) or a paragraph
      // (string). Falls back to a generic walkthrough in the detail page.
      howToUse: p.howToUse || p.usage || null,
      installCommand: `/plugin install ${p.name}@${marketplaceName}`,
    };
  });

  const categories = [...new Set(plugins.map((p) => p.category).filter(Boolean))].sort();

  return {
    marketplaceName,
    marketplaceUrl,
    ownerName,
    ownerUrl,
    description: catalog.description || "",
    addCommand: `/plugin marketplace add ${marketplaceUrl}`,
    plugins,
    categories,
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstSentence(text) {
  const m = String(text).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function page({ title, description, body, canonical, pluginData }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="theme-color" content="#0c0c0f" />
<link rel="icon" href="${href("/favicon.svg")}" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${href("/styles.css")}?v=${assetV.css}" />
${pluginData ? `<script id="plugin-data" type="application/json">${JSON.stringify(pluginData)}</script>` : ""}
</head>
<body>
${header()}
<main>
${body}
</main>
${footer()}
<script src="${href("/app.js")}?v=${assetV.js}" defer></script>
</body>
</html>
`;
}

function header() {
  return `<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${href("/")}">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">fidget.io</span>
    </a>
    <nav class="header-nav">
      <a href="${href("/#plugins")}">Browse</a>
      ${SHOW_ABOUT ? `<a href="${href("/about/")}">About</a>` : ""}
      <a href="https://github.com/blixxurd/fidget-marketplace" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  const year = 2026;
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <span class="muted">© ${year} Fidget Softworks, LLC</span>
  </div>
</footer>`;
}

/** A click-to-copy command box — the primary CTA throughout the site. */
function commandBox(command, { label = "", size = "md" } = {}) {
  return `<div class="cmd cmd-${size}">
  ${label ? `<span class="cmd-label">${esc(label)}</span>` : ""}
  <div class="cmd-row">
    <code class="cmd-text">${esc(command)}</code>
    <button class="cmd-copy" type="button" data-copy="${esc(command)}" aria-label="Copy command">
      <span class="cmd-copy-icon" aria-hidden="true"></span>
      <span class="cmd-copy-text">Copy</span>
    </button>
  </div>
</div>`;
}

function tagPills(tags) {
  if (!tags.length) return "";
  return `<ul class="tags">${tags
    .map((t) => `<li class="tag">${esc(t)}</li>`)
    .join("")}</ul>`;
}

function pluginIcon(name) {
  // Deterministic monogram tile — derives a hue from the name so each plugin
  // gets a stable, distinct accent without shipping per-plugin art.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const initials = name
    .split(/[-_\s]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  return `<span class="picon" style="--picon-h:${h}" aria-hidden="true">${esc(initials)}</span>`;
}

// ---------------------------------------------------------------------------
// Cards & pages
// ---------------------------------------------------------------------------

function pluginCard(p) {
  return `<article class="card" data-name="${esc(p.name.toLowerCase())}" data-desc="${esc(
    p.description.toLowerCase()
  )}" data-category="${esc(p.category)}" data-tags="${esc(p.tags.join(" ").toLowerCase())}">
  <a class="card-link" href="${esc(href(`/plugins/${p.slug}/`))}">
    <div class="card-head">
      ${pluginIcon(p.name)}
      <div class="card-heading">
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-author">${esc(p.author)}${
    p.isOfficial ? ` <span class="badge badge-official" title="Published by the marketplace owner">Official</span>` : ""
  }</p>
      </div>
    </div>
    <p class="card-desc">${esc(p.summary || p.description)}</p>
    ${tagPills(p.tags.slice(0, 3))}
  </a>
  ${commandBox(p.installCommand, { size: "sm" })}
</article>`;
}

function landingPage(model) {
  const count = model.plugins.length;
  const countLabel = count === 1 ? "1 plugin" : `${count} plugins`;
  const chips = model.categories.length
    ? `<div class="chips" id="chips">
        <button class="chip is-active" data-filter="all" type="button">All</button>
        ${model.categories
          .map((c) => `<button class="chip" data-filter="${esc(c)}" type="button">${esc(c)}</button>`)
          .join("")}
      </div>`
    : "";

  const body = `
<section class="hero">
  <div class="wrap">
    <p class="hero-kicker">Curated skills for Claude Code</p>
    <h1 class="hero-title">Luxury Skills Market</h1>
    <p class="hero-lede">A small, hand-picked shelf of the finest contexts — each one vetted, engineered, and installed in a single command.</p>
    <div class="hero-cta">
      ${commandBox(model.addCommand, { label: "Add the marketplace", size: "lg" })}
    </div>
  </div>
</section>

<section class="browse" id="plugins">
  <div class="wrap">
    <div class="browse-head">
      <h2 class="section-title">Browse ${esc(countLabel)}</h2>
    </div>
    ${chips}
    <div class="grid" id="grid">
      ${model.plugins.map(pluginCard).join("\n")}
    </div>
    <p class="empty" id="empty" hidden>No plugins match your search.</p>
  </div>
</section>`;

  return page({
    title: "fidget — the Luxury Skills Market for Claude Code",
    description:
      "A small, curated market of the finest skills for Claude Code — each one vetted, engineered, and installed in a single command.",
    canonical: SITE_URL + "/",
    body,
    pluginData: { count },
  });
}

function detailPage(model, p) {
  const related = model.plugins.filter((o) => o.slug !== p.slug).slice(0, 3);
  const relatedBlock = related.length
    ? `<section class="related">
        <h2 class="section-title">More from the catalog</h2>
        <div class="grid grid-related">${related.map(pluginCard).join("\n")}</div>
      </section>`
    : "";

  const body = `
<article class="detail">
  <div class="wrap">
    <a class="back" href="${href("/#plugins")}">← All plugins</a>

    <header class="detail-hero">
      ${pluginIcon(p.name)}
      <div class="detail-heading">
        <h1 class="detail-name">${esc(p.name)}</h1>
        <p class="detail-author">by ${esc(p.author)}${
    p.isOfficial ? ` <span class="badge badge-official">Official</span>` : ""
  }</p>
        ${tagPills(p.tags)}
      </div>
    </header>

    <div class="detail-grid">
      <div class="detail-main">
        <section class="install-block">
          <h2 class="install-title">Install</h2>
          <ol class="install-steps">
            <li>Add the marketplace (once):${commandBox(model.addCommand)}</li>
            <li>Install this plugin:${commandBox(p.installCommand)}</li>
          </ol>
          <p class="install-hint">Run these inside Claude Code.</p>
        </section>

        ${usageSection(p)}

        <section class="detail-about">
          <h2 class="section-title">About</h2>
          <p class="detail-desc">${esc(p.description)}</p>
        </section>
      </div>

      <aside class="detail-side">
        <dl class="meta">
          ${metaRow("Publisher", esc(p.author))}
          ${p.license ? metaRow("License", esc(p.license)) : ""}
          ${p.category ? metaRow("Category", esc(p.category)) : ""}
          ${p.isOfficial ? metaRow("Status", `<span class="badge badge-official">Official</span>`) : metaRow("Status", "Community")}
        </dl>
        ${
          p.sourceUrl
            ? `<a class="side-link" href="${esc(p.sourceUrl)}" rel="noopener">View source on GitHub →</a>`
            : ""
        }
      </aside>
    </div>

    ${relatedBlock}
  </div>
</article>`;

  return page({
    title: `${p.name} — fidget`,
    description: p.summary || p.description,
    canonical: `${SITE_URL}/plugins/${p.slug}/`,
    body,
  });
}

function metaRow(label, value) {
  return `<div class="meta-row"><dt>${label}</dt><dd>${value}</dd></div>`;
}

/**
 * "How to use it" — uses the plugin's own `howToUse` if the catalog provides
 * one (a string paragraph or an array of steps), otherwise a generic
 * walkthrough that holds for any fidget skill: install, then it auto-triggers.
 */
function usageSection(p) {
  const defaultSteps = [
    "Install it with the commands above — inside Claude Code.",
    "Then just work. The skill activates on its own when your task matches what it covers; there's no command to remember.",
    "It pulls in only the part it needs, section by section, so it stays light on your context window.",
  ];

  let bodyHtml;
  if (typeof p.howToUse === "string") {
    bodyHtml = `<p class="detail-desc">${esc(p.howToUse)}</p>`;
  } else {
    const steps = Array.isArray(p.howToUse) && p.howToUse.length ? p.howToUse : defaultSteps;
    bodyHtml = `<ol class="usage-steps">${steps
      .map((s) => `<li>${esc(s)}</li>`)
      .join("")}</ol>`;
  }

  const sourceHint = p.sourceUrl
    ? `<p class="install-hint">Want to see exactly what it bundles?
       <a href="${esc(p.sourceUrl)}" rel="noopener">Browse the source on GitHub →</a></p>`
    : "";

  return `<section class="detail-usage">
          <h2 class="section-title">How to use it</h2>
          ${bodyHtml}
          ${sourceHint}
        </section>`;
}

function aboutPage(model) {
  const body = `
<article class="about">
  <section class="about-hero">
    <div class="wrap">
      <p class="hero-eyebrow">About fidget</p>
      <h1 class="about-title">Context is the bottleneck.</h1>
      <p class="about-lead">
        An agent is only as good as what it knows when it sits down to work.
        fidget is a curated marketplace of contexts — packaged expertise you
        install in one line, so your agent shows up already fluent in the task
        at hand.
      </p>
    </div>
  </section>

  <div class="wrap about-body">
    <section class="prose">
      <h2>Why fidget exists</h2>
      <p>
        Every capable agent runs into the same wall: it doesn't know what you
        know. The reference material, the conventions, the hard-won
        right-way-to-do-it — that lives in someone's head, or scattered across a
        dozen tabs, and you rebuild it from scratch every time.
      </p>
      <p>
        fidget exists to end that. We take expertise that's painful to assemble
        and turn it into context you can install — once, cleanly, in a single
        command.
      </p>
    </section>

    <section class="prose">
      <h2>What a “context” is</h2>
      <p>
        Today, most fidget contexts are distilled reference knowledge — cited,
        vetted, and shaped so an agent can actually use it. Like
        <a href="${href("/plugins/agent-harness/")}">agent-harness</a>, our reference for
        building agentic systems.
      </p>
      <p>
        But “context” is the unit, not the limit. Anything that makes an agent
        better at a task — knowledge, conventions, the right way to behave — can
        become a fidget context.
      </p>
    </section>

    <section class="prose">
      <h2>What makes a fidget context good</h2>
      <p>
        Anyone can paste documentation into a prompt. fidget contexts are
        <em>engineered</em> — built like software, with the same discipline:
        sourced, verified, and structured to be cheap for an agent to read.
      </p>

      <div class="stats" aria-label="agent-harness, by the numbers">
        <div class="stat"><span class="stat-num">25</span><span class="stat-label">primary sources</span></div>
        <div class="stat"><span class="stat-num">154</span><span class="stat-label">claims extracted</span></div>
        <div class="stat"><span class="stat-num">3-vote</span><span class="stat-label">adversarial check</span></div>
        <div class="stat"><span class="stat-num">150</span><span class="stat-label">survived, all cited</span></div>
      </div>

      <div class="method">
        <div class="method-item">
          <h3>Built from primary sources, then stress-tested</h3>
          <p>
            Every claim traces back to a primary source — and has to earn its
            place. agent-harness distills 25 primary sources into 154 falsifiable
            claims, each run through a 3-vote adversarial check; only the 150 that
            survived made the guide, with the votes kept on record. Every claim is
            cited inline and linked to runnable, type-checked code.
          </p>
        </div>
        <div class="method-item">
          <h3>Engineered to spend fewer tokens</h3>
          <p>
            A context your agent can't navigate cheaply taxes every turn. fidget
            contexts route the agent to the one relevant section and read only
            that — a single manifest lookup plus a ~30-line read, citation already
            inline — instead of loading a whole document to use a corner of it.
            Progressive disclosure means it pulls only as deep as the question
            demands.
          </p>
        </div>
        <div class="method-item">
          <h3>Built to stay correct</h3>
          <p>
            The navigation an agent relies on can't be allowed to silently rot.
            Stable anchors, a single source of truth, and CI that fails the build
            when a link breaks or an index drifts keep every context honest as it
            changes.
          </p>
        </div>
        <div class="method-item">
          <h3>A method, not a one-off</h3>
          <p>
            This discipline is codified into a repeatable playbook we apply to
            every context, whatever the domain. The standard travels; only the
            subject changes — which is how a catalog stays trustworthy as it grows.
          </p>
        </div>
      </div>
    </section>

    <section class="prose">
      <h2>Curated, not crowdsourced</h2>
      <p>
        fidget is an index of quality, not a dump. Every context is chosen and
        held to that bar before it earns a place in the catalog. It's small on
        purpose — we'd rather ship a handful you can trust than a thousand you
        have to wade through.
      </p>
    </section>

    <section class="prose">
      <h2>Who it's for</h2>
      <p>
        fidget is for builders — whatever you build. A team standardizing how
        their agents work. A developer grounding an agentic system in real
        references. An SEO agency teaching an agent to write title tags that
        rank. A game studio encoding the logic of a skill tree.
      </p>
      <p class="prose-aside">The task is yours; the context makes your agent fluent in it.</p>
    </section>

    <section class="prose">
      <h2>A refined tinkerer</h2>
      <p>
        fidget is named for the good kind of restlessness — the curious, playful
        urge to pick something up and keep adjusting it until it feels right.
        That instinct is where good context comes from.
      </p>
      <p>
        We just refine it: take the tinkering, the trial and error, the
        “actually — do it this way,” and polish it into something you can depend
        on. Playful by nature, refined by discipline.
      </p>
      <blockquote class="founder-note">
        I built fidget because I couldn't stop fidgeting with my own setup — and
        the best of that work shouldn't have to be rebuilt by everyone, every
        time.
        <cite>— Aaron, Fidget Softworks</cite>
      </blockquote>
    </section>

    <section class="prose">
      <h2>Where it's going</h2>
      <p>
        For now, fidget is small and sharp: a few excellent contexts, proving a
        simple idea — that curated context is worth installing. Where it grows
        from here depends on what proves genuinely good. The horizon is a
        trusted home for context across every domain. We'll earn it one context
        at a time.
      </p>
    </section>

    <section class="about-cta">
      <h2 class="section-title">Start fidgeting</h2>
      ${commandBox(model.addCommand, { label: "Add the marketplace", size: "lg" })}
      <a class="about-browse" href="${href("/#plugins")}">Browse the catalog →</a>
    </section>
  </div>
</article>`;

  return page({
    title: "About — fidget",
    description:
      "fidget turns hard-won expertise into context you can install in one line. A curated marketplace of contexts for Claude Code.",
    canonical: SITE_URL + "/about/",
    body,
  });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build() {
  const raw = await readFile(CATALOG_PATH, "utf8").catch(() => {
    throw new Error(`Could not read catalog at ${CATALOG_PATH}`);
  });
  const catalog = JSON.parse(raw);
  const model = normalize(catalog);

  // Clean slate.
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  // Static assets → dist root.
  if (await exists(ASSETS_DIR)) {
    await cp(ASSETS_DIR, DIST_DIR, { recursive: true });
  }

  // Content-hash the cached assets so changes bust caches (filled before any
  // page() call, which reads assetV).
  assetV.css = hash8(await readFile(join(ASSETS_DIR, "styles.css")));
  assetV.js = hash8(await readFile(join(ASSETS_DIR, "app.js")));

  // Landing page.
  await writeFile(join(DIST_DIR, "index.html"), landingPage(model));

  // About page (hidden behind SHOW_ABOUT for now).
  if (SHOW_ABOUT) {
    await mkdir(join(DIST_DIR, "about"), { recursive: true });
    await writeFile(join(DIST_DIR, "about", "index.html"), aboutPage(model));
  }

  // Per-plugin pages at /plugins/<slug>/index.html (clean URLs).
  for (const p of model.plugins) {
    const dir = join(DIST_DIR, "plugins", p.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), detailPage(model, p));
  }

  // Also publish the raw catalog so the site and tooling share one artifact.
  await writeFile(join(DIST_DIR, "marketplace.json"), JSON.stringify(catalog, null, 2));

  // SEO niceties.
  await writeFile(join(DIST_DIR, "sitemap.xml"), sitemap(model));
  await writeFile(join(DIST_DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // GitHub Pages: skip Jekyll processing always; bind the custom domain only on
  // a root deploy (a project-subpath test build must not claim fidget.io).
  await writeFile(join(DIST_DIR, ".nojekyll"), "");
  if (SITE_DOMAIN && !BASE) await writeFile(join(DIST_DIR, "CNAME"), SITE_DOMAIN + "\n");

  console.log(`✓ Built ${model.plugins.length} plugin page(s) → ${DIST_DIR}`);
}

function sitemap(model) {
  const urls = [
    `${SITE_URL}/`,
    ...(SHOW_ABOUT ? [`${SITE_URL}/about/`] : []),
    ...model.plugins.map((p) => `${SITE_URL}/plugins/${p.slug}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

build().catch((err) => {
  console.error("Build failed:", err.message);
  process.exit(1);
});
