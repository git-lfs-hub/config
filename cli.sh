#!/bin/bash
set -Eeo pipefail
cd "$(dirname "$0")/.."

link() {
  local target=$1; shift
  local args=$1; shift
  [[ -e "$target" || -L "$target" ]] && return
  echo "link $target → $@"
  (cd "$(dirname "$target")" && ln "$args" "$@" "$(basename "$target")")
}

bun run config/src/cli.ts "$@"

link docs/vars.json -sf ../vars.json
rsync -ahi --out-format='sync %f -> docs/%f' assets/ docs/assets | awk '!/[/]\.?$/'

link server/wrangler.jsonc -sf ../wrangler.jsonc
link server/worker-configuration.d.ts -sf ../worker-configuration.d.ts
link server/public -sfn ../docs/site
