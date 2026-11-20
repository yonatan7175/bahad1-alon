#!/usr/bin/env bash
# Builds the CURRENT working tree for production and swaps it in with a few seconds of downtime.
#   pnpm release            (or ./deploy/local/release.sh)
# Production = systemd user service alon-prod (port 3000, behind Caddy). Dev = alon-dev (port 3001).
# The build goes to .next-prod-build first, so a failed build never touches the running site.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/opt/node/bin:$HOME/.local/bin:$PATH"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠ uncommitted changes — they WILL go live. Ctrl+C within 5 s to stop." >&2
  sleep 5
fi
echo "▶ building $(git rev-parse --short HEAD) …"
rm -rf .next-prod-build
pnpm gen
NODE_ENV=production BAHAD_DIST_DIR=.next-prod-build pnpm exec next build
echo "▶ swapping in the new build"
systemctl --user stop alon-prod.service || true
rm -rf .next-prod && mv .next-prod-build .next-prod
systemctl --user start alon-prod.service
for _ in $(seq 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "✔ live: $(git rev-parse --short HEAD) on :3000"
    exit 0
  fi
  sleep 1
done
echo "✖ the site did not come up — journalctl --user -u alon-prod -n 50" >&2
exit 1
