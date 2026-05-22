# Git LFS Hub — config

The vars renderer for [Git LFS Hub](https://github.com/git-lfs-hub). Turns your `vars.input.json` into the artifacts a deploy needs: a validated `vars.json`, a `wrangler.jsonc` for the Worker, and a `github-app.md` walking you through OAuth App registration. Merges your inputs with package defaults, Ajv-validates against the JSON Schema, renders Handlebars templates. Idempotent on re-run.

For the bigger picture (what the stack does, the deploy flow, the other repos) see the [org overview](https://github.com/git-lfs-hub).

## Getting started

This package is meant to run from a [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy) checkout via `bun run config`. You rarely need to work in this repo unless you are changing the schema or templates.

1. **Clone [git-lfs-hub/deploy](https://github.com/git-lfs-hub/deploy)** and run `bun install` at its root. That checkout wires this renderer into the Worker and [docs](https://github.com/git-lfs-hub/docs) workspaces.
2. **Add your vars file** — Copy `vars.input.example.json` from this package into the deploy root as `vars.input.json`, then edit your settings.
3. **Render config** — From the deploy root:

   ```sh
   bun run config                         # init (default)
   bun run config validate
   ```

## Vars

Edit **`vars.input.json`** at the deploy root. Merged with [`vars.template.json`](vars.template.json), validated against [`vars.schema.json`](vars.schema.json), and written to **`vars.json`** for the `wrangler.jsonc`, and `github-app.md`, [docs](https://github.com/git-lfs-hub/docs), and [e2e](https://github.com/git-lfs-hub/e2e).

### Required

- **`org`**: GitHub org display name

  - Used in docs
  - Populates: [`title`](vars.template.json#L2), [`github.home`](vars.template.json#L5), [GitHub OAuth App name](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L7)

- **`cloudflare.accountId`**: Cloudflare account ID (numeric, from dashboard)

  - Populates: [`s3.endpoint`](vars.template.json#L10) → [`vars.S3_ENDPOINT`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L43)

- **`cloudflare.accountSlug`**: `*.workers.dev` subdomain prefix for your Workers account

  - Populates: [`lfs.server`](vars.template.json#L8) → [`github.appHome`](vars.template.json#L6) → [`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46)

- Either: **`github.org[s]`**: org access mode (≤5)

  - Access is restricted to active org members
  - `github.orgs` is a JSON array or space/comma-separated string
  - Populates: [`vars.GITHUB_ORG[S]`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L47)

- Or: **`github.user`**: single-user access mode

  - Access is restricted to that GitHub username
  - Populates: [`vars.GITHUB_USER`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L51)

### Optional

- **`title`**: docs site title

  - Default: `{{org}} Hub`
  - Populates: `docs/docmd.config.js` site title; available as `{{title}}` in doc templates. Shown in nav only when using `logo` layout (not `banner`)

Docs nav branding (`assets/`):

- **`banner`** (default): wide nav docs image. Suppresses `title` text

  - `string`: one filename for both themes; 
  - `object: `{ "dark": "...", "light": "..." }` per theme
  - Default: `{ "dark": "banner-dark.png", "light": "banner-light.png" }`

- **`logo`**: compact docs nav image. Shows `title` beside it

  - Omit `banner` to use this layout
  - `string`: one filename for both themes; 
  - `object`: `{ "dark": "...", "light": "..." }` per theme

### Defaults

Filled from [`vars.template.json`](vars.template.json) when omitted from `vars.input.json`:

- **`lfs.server`**: public HTTPS hostname of the deployed Worker

  Used throughout [docs](https://github.com/git-lfs-hub/docs) (credential helper examples, `gh auth setup-git -h …`) and [e2e](https://github.com/git-lfs-hub/e2e) smoke tests.

  - Default: `{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev`
  - Populates: [`github.appHome`](vars.template.json#L6) → [`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46); available as `{{lfs.server}}` in doc templates

- **`cloudflare.workerName`**: Worker script identifier in the Cloudflare dashboard

  - Default: `lfs-server`
  - Populates: [`name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L7) in `wrangler.jsonc`; [`lfs.server`](vars.template.json#L8)

- **`s3.endpoint`**: R2 S3 API endpoint

  Presigned upload/download URLs; objects still verified via `LFS_BUCKET`.

  - Default: `https://{{cloudflare.accountId}}.r2.cloudflarestorage.com`
  - Populates: [`vars.S3_ENDPOINT`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L43)

- **`s3.bucket`**: R2 bucket for LFS objects

  Binding and presign must match. Staging CI appends `-staging`.

  - Default: `lfs-objects`
  - Populates: [`vars.S3_BUCKET_NAME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L44), [`r2_buckets.LFS_BUCKET.bucket_name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L25)

- **`github.home`**: GitHub profile URL shown in docs

  - Default: `https://github.com/<org-or-user>`

- **`github.appHome`**: Worker public base URL

  OAuth App homepage, callback base, web login redirect, and device-flow URLs.

  - Default: `https://{{lfs.server}}`
  - Populates: [`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46); [`github-app.template.md`](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L11) (Homepage URL and [callback URL](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L19))

### Extra keys

Extra keys are allowed (`additionalProperties: true`) and pass through to templates and docs.

## Commands

### `init` (default)

Read `vars.input.json` (or `vars.json` as fallback), merge with package defaults, validate, write `vars.json`, render `wrangler.jsonc` (skipped if it exists) and `github-app.md`.

- **`--cwd <dir>`** (default `.`): deploy checkout root.
- **`--force`** (default off): overwrite existing `wrangler.jsonc`.

### `validate`

Validate `vars.json` against the package schema.

- **`--cwd <dir>`** (default `.`): deploy checkout root.

## Inputs

- **`vars.input.json`**: user-edited; the primary input and resumption checkpoint.
  - If missing, falls back to **`vars.json`** as input source (still re-merged, re-validated, and rewritten).
- **`server/wrangler.template.jsonc`**: Handlebars source.
- **`server/github-app.template.md`**: Handlebars source.

## Outputs

- **`vars.json`**: merged, validated config consumed by deploy. Idempotent on re-run.
- **`wrangler.jsonc`**: created once unless `--force`.
- **`github-app.md`**: regenerated every run.
