#!/usr/bin/env node
// Minimal static preview server for site/dist (no dependencies).
// Resolves clean URLs like /plugins/agent-harness/ to their index.html.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(import.meta.url), "..", "..", "dist");
const PORT = Number(process.env.PORT) || 4321;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

async function tryFiles(pathname) {
  // Prevent path traversal; serve only from DIST.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidates = [];
  if (extname(safe)) {
    candidates.push(join(DIST, safe));
  } else {
    candidates.push(join(DIST, safe, "index.html"));
    candidates.push(join(DIST, safe.replace(/\/$/, "") + ".html"));
  }
  for (const file of candidates) {
    if (!file.startsWith(DIST)) continue;
    try {
      const body = await readFile(file);
      return { body, type: TYPES[extname(file)] || "application/octet-stream" };
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const hit = await tryFiles(decodeURIComponent(url.pathname));
  if (hit) {
    res.writeHead(200, { "content-type": hit.type });
    res.end(hit.body);
  } else {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1>");
  }
}).listen(PORT, () => {
  console.log(`fidget site → http://localhost:${PORT}`);
});
