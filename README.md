# Git LFS Hub — config

[![CI][ci-badge]][gh-wf-href]
[![Coverage][coverage-badge]][coverage-href]
[![CodeQL][codeql-badge]][codeql-href]
[![Socket][socket-badge]][socket-href]
[![License][license-badge]][license-href]

The vars renderer for [Git LFS Hub](https://github.com/git-lfs-hub). Turns your `vars.input.json` into the artifacts a deploy needs: a validated `vars.json`, a `wrangler.jsonc` for the Worker, and a `github-app.md` walking you through GitHub App registration. Merges your inputs with package defaults, Ajv-validates against the JSON Schema, renders Handlebars templates. Idempotent on re-run.

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
| `org` | GitHub org display name | [docs](https://github.com/git-lfs-hub/docs/tree/main/docs), [`title`](vars.template.json#L2), [`github.home`](vars.template.json#L5), [GitHub App name](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L11) |
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
| `github.appHome` | Worker public base URL. GitHub App homepage, callback base, web login redirect, and device-flow URLs.<br>Default: `https://{{lfs.server}}` | [`vars.GITHUB_APP_HOME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L46)<br>[`github-app.md`](https://github.com/git-lfs-hub/server/blob/main/github-app.template.md#L15) |
| `cloudflare.workerName` | Worker script identifier in Cloudflare dashboard.<br>Default: `lfs-server` | [`name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L7) in `wrangler.jsonc`<br>[`lfs.server`](vars.template.json#L8) |
| `s3.endpoint` | R2 S3 API endpoint for presigned upload/download URLs (direct client access).<br>Default: `https://{{cloudflare.accountId}}.r2.cloudflarestorage.com` | [`vars.S3_ENDPOINT`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L43) |
| `s3.bucket` | R2 bucket for LFS objects. Staging CI appends `-staging`.<br>Default: `lfs-objects` | [`vars.S3_BUCKET_NAME`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L44)<br>[`r2_buckets.LFS_BUCKET.bucket_name`](https://github.com/git-lfs-hub/server/blob/main/wrangler.template.jsonc#L25) |

### Extra keys

Extra keys are allowed and pass through to templates and docs.

## Commands

### `init` (default)

Resolve the input vars, merge with package defaults, apply the deploy env, validate, write `vars.json`, render `wrangler[.admin].jsonc` (skipped if it exists) and `github-app.md`.

- **`--cwd <dir>`** (default `.`): deploy checkout root.
- **`--env <name>`**: deploy env (e.g. `--env staging`). See [Deploy env](#deploy-env).

**Input vars** are read from the first available source (highest precedence first):

1. **`GLH_VARS_JSON`** env var: the vars as a JSON string.
2. **`vars.input.json`** in `--cwd`.
3. **`vars.json`** in `--cwd` (re-merged, re-validated, rewritten).

If none are present, fails with `No vars.input.json or vars.json in <ws>, and GLH_VARS_JSON unset`.

#### Deploy env

The deploy env appends a `-{env}` suffix to `cloudflare.workerName`, `cloudflare.admin.workerName`, and `s3.bucket`. Resolved from the first available source (highest precedence first):

1. **`--env <name>`** CLI flag.
2. **`GLH_ENV`** env var.
3. **`env`** field inside the resolved vars.

`""`, `production`, `prod`, or unset mean production and add **no** suffix; any other value appends `-{value}` (e.g. `staging` → `…-staging`).

### `validate`

Validate `vars.json` against the package schema.

- **`--cwd <dir>`** (default `.`): deploy checkout root.

## Inputs

- **`vars.input.json`**: user-edited; the primary input and resumption checkpoint. Overridden by the **`GLH_VARS_JSON`** env var; falls back to **`vars.json`** when absent. See [`init`](#init-default) for precedence.
- **`{server,admin}/wrangler.template.jsonc`**: Handlebars source.
- **`server/github-app.template.md`**: Handlebars source.

## Outputs

- **`vars.json`**: merged, validated config consumed by deploy. Idempotent on re-run.
- **`wrangler[.admin].jsonc`**: rendered from templates + vars.
- **`github-app.md`**: rendered from template + vars.

[ci-badge]: https://badgen.net/github/checks/git-lfs-hub/config/main?icon=vitest&label=CI
[gh-wf-href]: https://github.com/git-lfs-hub/config/actions/workflows/main.yml

[coverage-badge]: https://badgen.net/https/git-lfs-hub.github.io/config/coverage-badge.json?icon=vitest
[coverage-href]: https://git-lfs-hub.github.io/config/lcov-report/

[codeql-badge]: https://github.com/git-lfs-hub/config/actions/workflows/github-code-scanning/codeql/badge.svg
[codeql-href]: https://github.com/git-lfs-hub/config/actions/workflows/github-code-scanning/codeql?query=branch%3Amain

[socket-badge]: https://badgen.net/static/Socket/report/blue?icon=socket
[socket-href]: https://socket.dev/dashboard/org/git-lfs-hub/repo/@git-lfs-hub/config

[license-badge]: https://badgen.net/github/license/git-lfs-hub/config
[license-href]: LICENSE.md
