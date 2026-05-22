# Git LFS Hub — config

The vars renderer for [Git LFS Hub](https://github.com/git-lfs-hub). Turns your `vars.input.json` into the artifacts a deploy needs: a validated `vars.json`, a `wrangler.jsonc` for the Worker, and a `github-app.md` walking you through OAuth App registration. Merges your inputs with package defaults, Ajv-validates against the JSON Schema, renders Handlebars templates. Idempotent on re-run.

For the bigger picture (what the stack does, the deploy flow, the other repos) see the [org overview](https://github.com/git-lfs-hub).

## Getting started

This package is meant to run from a [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy) checkout via `bun run config`. You rarely need to work in this repo unless you are changing the schema or templates.

1. **Clone [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy)** and run `bun install` at its root. That checkout wires this renderer into the Worker and [docs](https://github.com/git-lfs-hub/docs) workspaces.
2. **Add your vars file**. Copy `vars.input.example.json` from this package into the deploy root as `vars.input.json`, then edit your settings.
3. **Render config**. From the deploy root:

   ```sh
   bun run config                         # init (default)
   bun run config validate
   ```

## Vars

Edit **`vars.input.json`** at the deploy root. Merged with [`vars.template.json`](vars.template.json), validated against [`vars.schema.json`](vars.schema.json), and written to **`vars.json`** for the [`wrangler.jsonc`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc), [`github-app.md`](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md), [docs](https://github.com/git-lfs-hub/docs), and [e2e](https://github.com/git-lfs-hub/e2e):

| Var | Description | Used in |
|:----|:------------|:--------|
| `org` | GitHub org display name | [docs](https://github.com/git-lfs-hub/docs/tree/main/docs), [`title`](vars.template.json#L2), [`github.home`](vars.template.json#L5), [GitHub OAuth App name](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L7) |
| `cloudflare.accountId` | Cloudflare account ID (numeric, from dashboard). | [`s3.endpoint`](vars.template.json#L10) →<br>[`vars.S3_ENDPOINT`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L43) |
| `cloudflare.accountSlug` | `*.workers.dev` subdomain prefix for your Workers account. | [`lfs.server`](vars.template.json#L8) →<br>[`github.appHome`](vars.template.json#L6) →<br>[`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46) |
| `github.org[s]` -- either | Active org members access mode (≤5). JSON array or space/comma-separated string. | [`vars.GITHUB_ORG[S]`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L47) |
| `github.user` -- or | Single-user access mode. | [`vars.GITHUB_USER`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L51) |

Optional, filled from [`vars.template.json`](vars.template.json) when omitted from `vars.input.json`:

| Var | Description | Used in |
|:----|:------------|:--------|
| `title` | Default: `{{org}} Hub` | [docs](https://github.com/git-lfs-hub/docs) site title |
| `banner` -- either | Wide nav docs `assets/` image. Suppresses `title` text.<br>Default: `{ "dark": "banner-dark.png", "light": "banner-light.png" }` | [docsmd.config](https://github.com/git-lfs-hub/docs/blob/main/docmd.config.js#L21) |
| `logo` -- or | Compact docs nav `assets/` image. Shows `title` beside it.<br>Both `banner` and `logo` accept `"..."` or `{ "dark": "...", "light": "..." }`. | [docsmd.config](https://github.com/git-lfs-hub/docs/blob/main/docmd.config.js#L21) |
| `lfs.server` | Public HTTPS hostname of deployed Worker.<br>Default: `{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev` | [docs](https://github.com/git-lfs-hub/docs/tree/main/docs), [e2e](https://github.com/git-lfs-hub/e2e) smoke tests. [`github.appHome`](vars.template.json#L6) →<br>[`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46) |
| `github.home` | GitHub profile URL.<br>Default: `https://github.com/<org-or-user>` | [docs](https://github.com/git-lfs-hub/docs/tree/main/docs) |
| `github.appHome` | Worker public base URL. OAuth App homepage, callback base, web login redirect, and device-flow URLs.<br>Default: `https://{{lfs.server}}` | [`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46)<br>[`github-app.md`](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L11) |
| `cloudflare.workerName` | Worker script identifier in Cloudflare dashboard.<br>Default: `lfs-server` | [`name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L7) in `wrangler.jsonc`<br>[`lfs.server`](vars.template.json#L8) |
| `s3.endpoint` | R2 S3 API endpoint for presigned upload/download URLs (direct client access).<br>Default: `https://{{cloudflare.accountId}}.r2.cloudflarestorage.com` | [`vars.S3_ENDPOINT`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L43) |
| `s3.bucket` | R2 bucket for LFS objects. Staging CI appends `-staging`.<br>Default: `lfs-objects` | [`vars.S3_BUCKET_NAME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L44)<br>[`r2_buckets.LFS_BUCKET.bucket_name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L25) |

### Extra keys

Extra keys are allowed and pass through to templates and docs.

## Commands

### `init` (default)

Read `vars.input.json` (or `vars.json` as fallback), merge with package defaults, validate, write `vars.json`, render `wrangler.jsonc` (skipped if it exists) and `github-app.md`.

- **`--cwd <dir>`** (default `.`): deploy checkout root.
- **`--force`** (default off): overwrite existing `wrangler.jsonc`.

### `validate`

Validate `vars.json` against the package schema.

- **`--cwd <dir>`** (default `.`): deploy checkout root.

## Inputs

- **`vars.input.json`**: user-edited; the primary input and resumption checkpoint. If missing, falls back to **`vars.json`** as input source (still re-merged, re-validated, and rewritten).
- **`server/wrangler.template.jsonc`**: Handlebars source.
- **`server/github-app.template.md`**: Handlebars source.

## Outputs

- **`vars.json`**: merged, validated config consumed by deploy. Idempotent on re-run.
- **`wrangler.jsonc`**: created once unless `--force`.
- **`github-app.md`**: regenerated every run.
