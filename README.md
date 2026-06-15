# fidget

Pre-curated, quality contexts for [Claude Code](https://code.claude.com/docs/en/plugins).

This repo is the **marketplace catalog** — it doesn't contain the contexts themselves. Each
context lives in its own repo and is listed here as a `github`-sourced plugin. The catalog
is just the index; installing a plugin pulls its skills from that plugin's own repo.

## Use it

```
/plugin marketplace add https://fidget.io/marketplace.json
/plugin install agent-harness@fidget
```

## Contexts

| Plugin | Source repo | What it gives you |
|---|---|---|
| `agent-harness` | [`blixxurd/context-agent-harnesses`](https://github.com/blixxurd/context-agent-harnesses) | Cited reference for building agent harnesses: the agentic loop, tool design, context/memory, permissions/sandboxing, subagents, resilience, observability, and evals. |

## Website

The public marketplace site (deployed to [fidget.io](https://fidget.io)) lives in
[`site/`](site/). It's a static site whose build step compiles this catalog into
HTML — add a plugin to `marketplace.json`, run `npm run build` in `site/`, and it
shows up on the site. See [`site/README.md`](site/README.md) for details.

## Adding a context

1. Create a repo with a `.claude-plugin/plugin.json` and one or more `skills/<name>/SKILL.md`.
2. Push it to GitHub.
3. Add an entry to [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json):
   ```json
   {
     "name": "<plugin-name>",
     "source": { "source": "github", "repo": "<owner>/<repo>" },
     "description": "<one-line storefront>"
   }
   ```
   The `name` must match the `name` in that repo's `plugin.json`.
