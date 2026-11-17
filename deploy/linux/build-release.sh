#!/usr/bin/env bash
# Builds a self-contained release of the portal ON THE LINUX SERVER (see LINUX.md §4).
#   sudo -u bahad ./deploy/linux/build-release.sh            → /opt/bahad/releases/<timestamp>, then switches /opt/bahad/current
# NEXT_PUBLIC_* values are baked in at build time, so the env file is loaded first.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/bahad/env}"
BASE="${BAHAD_HOME:-/opt/bahad}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$BASE/releases/$ts"

[[ -r "$ENV_FILE" ]] || { echo "✖ cannot read $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export NODE_ENV=production BAHAD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1

pnpm install --frozen-lockfile
pnpm build

mkdir -p "$dest/.next"
cp -a .next/standalone/. "$dest/"
cp -a .next/static "$dest/.next/static"
cp -a public "$dest/public"
ln -sfn "$dest" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"   # atomic switch (GNU mv)
echo "✔ release $dest is now $BASE/current — restart: sudo systemctl restart bahad"

# keep the 5 newest releases
ls -1dt "$BASE"/releases/*/ | tail -n +6 | while IFS= read -r old; do rm -rf -- "$old"; done
