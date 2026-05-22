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

## Vars

Edit **`vars.input.json`** at the deploy root. **`init`** deep-merges it with [`vars.template.json`](vars.template.json) (Handlebars defaults), normalizes GitHub fields, validates against [`vars.schema.json`](vars.schema.json), and writes **`vars.json`** for the Worker, docs, and e2e.

### Required

<details>
<summary><b><code>org</code></b> — GitHub org display name.</summary>

Appears throughout docs as `{{org}}` and as the OAuth App name in `github-app.md`.

- **Populates:** `title` default (`{{org}} Hub`), `github.home` default

</details>

<details>
<summary><b><code>cloudflare.accountId</code></b> — Cloudflare account ID (numeric, from dashboard).</summary>

- **Populates:** `s3.endpoint` default (`https://{{cloudflare.accountId}}.r2.cloudflarestorage.com`) → `vars.S3_ENDPOINT`

</details>

<details>
<summary><b><code>cloudflare.accountSlug</code></b> — <code>*.workers.dev</code> subdomain prefix for your Workers account.</summary>

- **Populates:** `lfs.server` default (`{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev`) → `github.appHome` default → `vars.GITHUB_APP_HOME`

</details>

<details>
<summary>Either: <b><code>github.org[s]</code></b> — Org access mode (≤5).</summary>

A JSON array or space/comma-separated string.
- Web UI: login requires active GitHub org membership in one of the listed orgs (checked via GitHub's membership API; pending invites are rejected).
- LFS API: `/:owner/...` routes are served only when `:owner` matches a listed org; token is validated per-repo.
- **Populates:** `vars.GITHUB_ORG` (single org) or `vars.GITHUB_ORGS` (multiple, space-separated)

</details>

<details>
<summary>Or: <b><code>github.user</code></b> — Single-user access mode.</summary>

- Web UI: login is restricted to that GitHub username (case-insensitive).
- LFS API: only `/:user/...` routes are served.
- **Populates:** `vars.GITHUB_USER`

</details>

### Optional

<details>
<summary><b><code>title</code></b> — Docs site title.</summary>

- **Default:** `{{org}} Hub`
- **Populates:** `docs/docmd.config.js` site title; available as `{{title}}` in doc templates. Shown in nav only when using `logo` layout (not `banner`).

</details>

Docs nav branding (`assets/`):

<details>
<summary><b><code>banner</code></b> (default) — Wide nav docs image. Suppresses <code>title</code> text.</summary>

- **string** — one filename for both themes; **object** — `{ "dark": "...", "light": "..." }` per theme.
- **Default:** `{ "dark": "banner-dark.png", "light": "banner-light.png" }`
- **Populates:** `docs/docmd.config.js` logo config (dark/light paths from `assets/`)

</details>

<details>
<summary><b><code>logo</code></b> — Compact docs nav image. Shows <code>title</code> beside it.</summary>

- Omit `banner` to use this layout.
- **string** — one filename for both themes; **object** — `{ "dark": "...", "light": "..." }` per theme.
- **Populates:** `docs/docmd.config.js` logo config (used when `banner` is absent)

</details>

<details>
<summary><b><code>sentry.org</code></b> — Sentry organization slug.</summary>

Runtime error reporting uses `SENTRY_DSN` (secret), not this var.

- **Default:** —
- **Populates:** `vars.SENTRY_ORG`

</details>

### Defaults

Filled from [`vars.template.json`](vars.template.json) when omitted from `vars.input.json`:

<details>
<summary><b><code>lfs.server</code></b> — Public HTTPS hostname of the deployed Worker.</summary>

Used throughout docs (credential helper examples, `gh auth setup-git -h …`) and e2e smoke tests.

- **Default:** `{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev`
- **Populates:** `github.appHome` default → `vars.GITHUB_APP_HOME`; available as `{{lfs.server}}` in doc templates

</details>

<details>
<summary><b><code>cloudflare.workerName</code></b> — Worker script identifier in the Cloudflare dashboard.</summary>

- **Default:** `lfs-server`
- **Populates:** `wrangler.jsonc` → `name`; `lfs.server` default

</details>

<details>
<summary><b><code>s3.endpoint</code></b> — R2 S3 API endpoint.</summary>

Presigned upload/download URLs; objects still verified via `LFS_BUCKET`.

- **Default:** `https://{{cloudflare.accountId}}.r2.cloudflarestorage.com`
- **Populates:** `vars.S3_ENDPOINT`

</details>

<details>
<summary><b><code>s3.bucket</code></b> — R2 bucket for LFS objects.</summary>

Binding and presign must match. Staging CI appends `-staging`.

- **Default:** `lfs-objects`
- **Populates:** `vars.S3_BUCKET_NAME`, `r2_buckets.LFS_BUCKET.bucket_name`

</details>

<details>
<summary><b><code>github.home</code></b> — GitHub profile URL shown in docs.</summary>

- **Default:** `https://github.com/<org-or-user>`

</details>

<details>
<summary><b><code>github.appHome</code></b> — Worker public base URL.</summary>

OAuth App homepage, callback base, web login redirect, and device-flow URLs.

- **Default:** `https://{{lfs.server}}`
- **Populates:** `vars.GITHUB_APP_HOME`; `github-app.md` (Homepage URL and callback base)

</details>

### Extra keys

Extra keys are allowed (`additionalProperties: true`) and pass through to templates and docs.

## Commands

### `init` (default)

Read `vars.input.json` (or `vars.json` as fallback), merge with package defaults, validate, write `vars.json`, render `wrangler.jsonc` (skipped if it exists) and `github-app.md`.

- **`--cwd <dir>`** (default `.`) — Deploy checkout root.
- **`--force`** (default off) — Overwrite existing `wrangler.jsonc`.

### `validate`

Ajv-validate `vars.json` against the package schema.

- **`--cwd <dir>`** (default `.`) — Deploy checkout root.

## Inputs

- **`vars.input.json`** — User-edited; the primary input and resumption checkpoint.
  - If missing, falls back to **`vars.json`** as input source (still re-merged, re-validated, and rewritten).
- **`server/wrangler.template.jsonc`** — Handlebars source.
- **`server/github-app.template.md`** — Handlebars source.

## Outputs

- **`vars.json`** — Merged, validated config consumed by deploy. Idempotent on re-run.
- **`wrangler.jsonc`** — Created once unless `--force`.
- **`github-app.md`** — Regenerated every run.
