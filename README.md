# Git LFS Hub — config

The vars renderer for [Git LFS Hub](https://github.com/git-lfs-hub). Turns your `vars.input.json` into the artifacts a deploy needs: a validated `vars.json`, a `wrangler.jsonc` for the Worker, and a `github-app.md` walking you through OAuth App registration. Merges your inputs with package defaults, Ajv-validates against the JSON Schema, renders Handlebars templates. Idempotent on re-run.

For the bigger picture (what the stack does, the deploy flow, the other repos) see the [org overview](https://github.com/git-lfs-hub).

Invoked from a [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy) checkout as `bun run config` (which runs `bunx github:git-lfs-hub/config`). You rarely need to touch this repo directly unless you're changing the schema or templates.

## Usage

From a deploy checkout (one-shot, no install):

```sh
bunx github:git-lfs-hub/config         # init (default)
bunx github:git-lfs-hub/config validate
```

Or via the deploy root's `package.json` script:

```sh
bun run config
```

## Commands

| Command | Action |
|---------|--------|
| (default) `init` | Read `vars.input.json` (or `vars.json` as fallback), merge with package defaults, validate, write `vars.json`, render `wrangler.jsonc` (skipped if exists) and `github-app.md`. |
| `validate` | Ajv-validate `vars.json` against the package schema. |

## Flags

| Flag | Default | Applies to | Notes |
|------|---------|------------|-------|
| `--cwd <dir>` | `.` | both | Deploy checkout root. |
| `--force` | off | `init` | Overwrite existing `wrangler.jsonc`. |

## File contract (`cwd`)

| File | Direction | Notes |
|------|-----------|-------|
| `vars.input.json` | input (preferred) | User-edited; resume checkpoint. |
| `vars.json` | input (fallback) and **always output** | Merged, validated config consumed by deploy. Idempotent on re-run. |
| `server/wrangler.template.jsonc` | input | Handlebars source. |
| `server/github-app.template.md` | input | Handlebars source. |
| `wrangler.jsonc` | output | Created once unless `--force`. |
| `github-app.md` | output | Regenerated every run. |

## Starter

Copy `vars.input.example.json` from this package into your deploy checkout as `vars.input.json` and edit.
