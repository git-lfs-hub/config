#!/usr/bin/env bash
set -Eeo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo 'Usage: config/upstream.sh setup|pre-commit' >&2
  exit 1
}

cmd_setup() {
  echo 'core.excludesFile = .gitignore-upstream'
  git config --local core.excludesFile '.gitignore-upstream'

  hook="$(git rev-parse --git-path hooks)/pre-commit"
  echo "install $hook"
  cat >"$hook" <<'EOF'
#!/bin/sh
exec "$(git rev-parse --show-toplevel)/config/upstream.sh" pre-commit
EOF
  chmod +x "$hook"
}

cmd_pre_commit() {
  tracked=$(git ls-files -ci --exclude-from='.gitignore-upstream')
  if [[ -n "$tracked" ]]; then
    printf '::error::Do not commit these (see .gitignore-upstream):\n%s\n' "$tracked"
    exit 1
  fi
}

case "${1:-}" in
setup) cmd_setup ;;
pre-commit) cmd_pre_commit ;;
*) usage ;;
esac
