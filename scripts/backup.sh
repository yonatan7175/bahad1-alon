#!/usr/bin/env bash
# Weekly ENCRYPTED database backup (plan 06 — Backups, plan 11 — Phase 6).
# Never writes an unencrypted file. Portable: bash + pg_dump + gzip + (age | gpg). Works on Linux and macOS.
#
#   DATABASE_URL=postgres://…  BACKUP_AGE_RECIPIENT=age1…   ./scripts/backup.sh
#   DATABASE_URL=postgres://…  BACKUP_GPG_RECIPIENT=you@x  ./scripts/backup.sh
#
# Env: BACKUP_DIR (default ./backups), BACKUP_KEEP (default 8 newest files kept).
# pg_dump's major version must be >= the server's (Supabase: check Settings → Infrastructure).
# Contents, in restore order: 1) identities (auth.users id/email/metadata, "on conflict do nothing"),
# 2) the public schema + data (pg_dump), 3) supabase/post-restore.sql (trigger, grants, realtime policy).
# Restore: see HANDOVER.md → "Restoring a backup".
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-8}"

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null || { echo "✖ 'age' is not installed" >&2; exit 1; }
  encrypt=(age -r "$BACKUP_AGE_RECIPIENT")
  ext="sql.gz.age"
elif [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  command -v gpg >/dev/null || { echo "✖ 'gpg' is not installed" >&2; exit 1; }
  encrypt=(gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output -)
  ext="sql.gz.gpg"
else
  echo "✖ set BACKUP_AGE_RECIPIENT or BACKUP_GPG_RECIPIENT — refusing to write an unencrypted backup" >&2
  exit 1
fi
command -v pg_dump >/dev/null || { echo "✖ pg_dump is not installed (Linux: apt install postgresql-client-17)" >&2; exit 1; }
command -v psql >/dev/null || { echo "✖ psql is not installed (Linux: apt install postgresql-client-17)" >&2; exit 1; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -r "$here/supabase/post-restore.sql" ]] || { echo "✖ $here/supabase/post-restore.sql not found" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
umask 077
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/bahad-$ts.$ext"
tmp="$out.partial"

set -o pipefail
{
  echo "-- bahad backup $ts"
  echo "-- 1) identities (profiles reference auth.users, so these come first)"
  psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c \
    "select format('insert into auth.users (id, email, raw_user_meta_data, created_at) values (%L, %L, %L, %L) on conflict (id) do nothing;', id, email, coalesce(raw_user_meta_data, '{}'::jsonb), created_at) from auth.users order by created_at"
  echo "-- 2) public schema and data"
  # --rows-per-insert: plain INSERTs restore on any Postgres/psql (no COPY protocol needed).
  # The "CREATE SCHEMA public" line is dropped: public always exists already.
  pg_dump --no-owner --no-privileges --schema=public --rows-per-insert=200 "$DATABASE_URL" | sed '/^CREATE SCHEMA public;$/d'
  echo "-- 3) re-apply trigger / grants / realtime policy"
  cat "$here/supabase/post-restore.sql"
} | gzip -9 | "${encrypt[@]}" > "$tmp"
mv "$tmp" "$out"
echo "✔ $out ($(wc -c < "$out" | tr -d ' ') bytes)"

# Keep only the newest $BACKUP_KEEP backups (portable: no GNU-only flags).
ls -1t "$BACKUP_DIR"/bahad-*."$ext" 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do rm -f -- "$old"; done
