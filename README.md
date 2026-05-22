# Git LFS Hub — config

The vars renderer for [Git LFS Hub](https://github.com/git-lfs-hub). Turns your `vars.input.json` into the artifacts a deploy needs: a validated `vars.json`, a `wrangler.jsonc` for the Worker, and a `github-app.md` walking you through OAuth App registration. Merges your inputs with package defaults, Ajv-validates against the JSON Schema, renders Handlebars templates. Idempotent on re-run.

For the bigger picture (what the stack does, the deploy flow, the other repos) see the [org overview](https://github.com/git-lfs-hub).

## Getting started

This package is meant to run from a [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy) checkout via `bun run config`. You rarely need to work in this repo unless you are changing the schema or templates.

1. **Clone [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy)** and run `bun install` at its root. That checkout wires this renderer into the Worker and docs workspaces.
2. **Add your vars file** — Copy `vars.input.example.json` from this package into the deploy root as `vars.input.json`, then edit your settings.
3. **Render config** — From the deploy root:

   ```sh
   bun run config                         # init (default)
   bun run config validate
   ```

   `init` merges your input with package defaults, validates, and writes `vars.json`, `wrangler.jsonc`, and `github-app.md`. `validate` only checks an existing `vars.json`.

## Commands

### `init` (default)

Read `vars.input.json` (or `vars.json` as fallback), merge with package defaults, validate, write `vars.json`, render `wrangler.jsonc` (skipped if exists) and `github-app.md`.

- **`--cwd <dir>`** (default `.`) — Deploy checkout root.
- **`--force`** (default off) — Overwrite existing `wrangler.jsonc`.

### `validate`

Ajv-validate `vars.json` against the package schema.

- **`--cwd <dir>`** (default `.`) — Deploy checkout root.

## Inputs

- **`vars.input.json`** — User-edited; resume checkpoint.
  - If missing, reads and updates **`vars.json`** in place.
- **`server/wrangler.template.jsonc`** — Handlebars source.
- **`server/github-app.template.md`** — Handlebars source.

## Outputs

- **`vars.json`** — Merged, validated config consumed by deploy. Idempotent on re-run.
- **`wrangler.jsonc`** — Created once unless `--force`.
- **`github-app.md`** — Regenerated every run.
