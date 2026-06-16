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

bun run config/src/cli.ts vars . "$@"

link docs/vars.json -sf ../vars.json
rsync -ahi --out-format='sync %f -> docs/%f' assets/ docs/assets | awk '!/[/]\.?$/'

link e2e/vars.json -sf ../vars.json

link server/vars.json -sf ../vars.json
link server/public -sfn ../docs/site

if [ -d admin ]; then
    link admin/vars.json -sf ../vars.json
    rsync -ahi --out-format='sync %f -> admin/public/%f' assets/favicon.png admin/public/ | awk '!/[/]\.?$/'
fi
