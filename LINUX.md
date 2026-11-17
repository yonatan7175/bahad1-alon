# Running on Linux

The portal was built and tested on macOS, but **everything that ships is Linux-ready**. CI already runs every check, the production build and the browser security tests on Ubuntu (`.github/workflows/ci.yml`). This file lists what changes when you move off the Mac. Some of it applies to any Linux machine; the rest only if you self-host instead of Vercel.

> TL;DR: no code changes are needed. On Linux you change **how it is hosted** (systemd + Caddy instead of Vercel), optionally **where the database lives**, and a few **operational details**: case-sensitive files, a public HTTPS domain, `pg_dump` versions and file permissions.

---

## 1. Things that differ between macOS and Linux (apply to any Linux use)

| Topic | macOS (where it was built) | Linux | What to do |
|---|---|---|---|
| **File-name case** | case-insensitive (`App.tsx` = `app.tsx`) | **case-sensitive** | Imports must match the real file name exactly. `tsconfig.json` has `forceConsistentCasingInFileNames`, and CI on Ubuntu catches mistakes. All folders and slugs are lowercase by rule. |
| **Line endings** | LF | LF | `.gitattributes` forces LF, so files edited on Windows can't break `scripts/*.sh` (`bad interpreter: /bin/bash^M`). |
| **Executable bits** | kept by git | kept by git | `scripts/backup.sh` and `deploy/linux/build-release.sh` are committed as executable. If you copy files instead of cloning: `chmod +x scripts/*.sh deploy/linux/*.sh`. |
| **Shell tools** | BSD `sed`/`date`/`stat` | GNU | The repo scripts use only portable flags. `deploy/linux/build-release.sh` uses GNU `mv -T` on purpose (Linux only). Don't add `sed -i ''` (BSD-only) or `date -v` to scripts. |
| **Node.js** | Homebrew `node@24` | Install Node **24 LTS** (NodeSource or `nvm`). Minimum 22. | `corepack enable` then `pnpm -v`. The exact version is pinned in `package.json → packageManager` (`pnpm@12.21.0`). |
| **pnpm build scripts** | — | same | `pnpm-workspace.yaml → allowBuilds` allows only `esbuild`. `sharp` is not needed (no `next/image` optimization is used). |
| **Playwright (tests)** | browsers in `~/Library/Caches` | browsers in `~/.cache/ms-playwright` and they **need system libraries** | `pnpm exec playwright install --with-deps chromium` (needs sudo for the apt packages). Only needed to run `pnpm e2e` / `pnpm icons`. |
| **File watching (`pnpm dev`)** | FSEvents | inotify | If dev hot-reload stops working: `echo fs.inotify.max_user_watches=524288 \| sudo tee /etc/sysctl.d/40-inotify.conf && sudo sysctl --system`. |
| **Timezone** | Asia/Jerusalem | often UTC on servers | **No change needed.** All logic uses explicit `Asia/Jerusalem` (laundry, schedule, admin dates) or UTC (database, cron). Node ships full ICU, so this works without `tzdata` tweaks. |
| **Local data dir** | `.data/pglite` | same | Only for dev/tests. Must be writable by the user that runs `pnpm dev`. Never run two processes on the same PGlite dir. |
| **Service manager** | launchd (`~/Library/LaunchAgents`) | **systemd** | Units are ready in `deploy/linux/` (see §4). There is no launchd file to port, because the portal was never run as a Mac service. |

---

## 2. Choose a hosting setup

| | Where Next.js runs | Database | Login (Google) | Live updates | Cron (push every minute) |
|---|---|---|---|---|---|
| **Plan default: Vercel** (no Linux server) | Vercel | Supabase | Supabase Auth | Supabase Realtime | Supabase `pg_cron` → `/api/cron/push` (`supabase/cron.sql`) |
| **A. Linux box + Supabase** | your Linux server | Supabase | Supabase Auth | `sse` (in-process) | `BAHAD_INTERNAL_CRON=1` (or systemd timers) |
| **B. Linux box + own Postgres** | your Linux server | Postgres on the box | Supabase Auth (free, only for Google sign-in) | `sse` | `BAHAD_INTERNAL_CRON=1` (or systemd timers) |
| C. Fully self-hosted | your Linux server | self-hosted Supabase (Docker) | self-hosted Supabase Auth | `supabase` or `sse` | `pg_cron` or timers |

Recommended on Linux: **A**, which keeps Supabase's free backups and dashboard and changes the least. Use **B** when the data must stay on the box. C is possible but means running and upgrading the whole Supabase Docker stack.

What changes in code for each: **nothing**. Everything is controlled by environment variables (`.env.example`, `deploy/linux/env.example`):

- `NEXT_PUBLIC_BAHAD_REALTIME=sse` — live "changed" signals stream from the Node process (`/api/platform/events`). **Requires exactly one Node process.** Do not run several instances, or PM2/cluster mode, behind a load balancer: a write on instance 1 would not signal clients on instance 2. If you ever need several instances, use `supabase` realtime.
- `BAHAD_INTERNAL_CRON=1` — the Node process sends due push notifications every minute and runs the daily cleanup itself (`src/instrumentation.ts`). Use it **or** the systemd timers, not both. (Both would still be safe: rows are claimed with `FOR UPDATE SKIP LOCKED`, so nothing is sent twice.)
- `BAHAD_AUTH_SHIM=1` (option B only) — the local `auth.users` table is the shim from `supabase/local/00_auth_shim.sql`, and every Google identity is mirrored into it on first sign-in.

---

## 3. Server prerequisites (Ubuntu 24.04 / Debian 12)

```bash
sudo apt update && sudo apt install -y curl git ca-certificates
# Node 24 LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
sudo corepack enable
# HTTPS reverse proxy (automatic certificates)
sudo apt install -y caddy            # or nginx + certbot (deploy/linux/nginx.conf)
# Backups: pg_dump must be >= the server's Postgres major version (Supabase is 15/17 — check Settings → Infrastructure)
sudo apt install -y postgresql-client-17 age
# Option B only: the database itself
sudo apt install -y postgresql-17
# A dedicated user
sudo useradd --system --create-home --home-dir /opt/bahad --shell /usr/sbin/nologin bahad
```

**A public domain + HTTPS is mandatory**, not optional:
- **Web Push** (notifications) only works on HTTPS (and on iPhone not at all, because the portal is not installable)
- Google sign-in redirects back to a fixed URL
- phones on mobile data must reach the server, so a LAN-only address (like `192.168.x.x`) is not enough

Point a DNS record at the server, open ports 80 and 443 (`sudo ufw allow 80,443/tcp`), and keep 3000 closed (Next listens on `127.0.0.1` only).

---

## 4. Deploy (options A and B)

```bash
# 1. Code
sudo -u bahad git clone <repo-url> /opt/bahad/src
# 2. Environment (secrets!) — root-owned, readable by the service user only
sudo install -d -m 750 -o root -g bahad /etc/bahad
sudo cp /opt/bahad/src/deploy/linux/env.example /etc/bahad/env
sudo chmod 640 /etc/bahad/env && sudo chown root:bahad /etc/bahad/env
sudoedit /etc/bahad/env          # fill in values (see docs/SETUP.md for where each comes from)
# 3. Database schema
cd /opt/bahad/src
sudo -u bahad bash -c 'set -a; . /etc/bahad/env; set +a; pnpm install --frozen-lockfile && pnpm db:migrate'          # option A
#   option B: create the DB first, then migrate WITH the auth shim:
#   sudo -u postgres createuser bahad -P && sudo -u postgres createdb -O bahad bahad
#   sudo -u bahad bash -c 'set -a; . /etc/bahad/env; set +a; pnpm db:migrate --shim'
# 4. Build a release (NEXT_PUBLIC_* are baked in at build time — the script loads /etc/bahad/env)
sudo -u bahad ./deploy/linux/build-release.sh
# 5. Service + HTTPS
sudo cp deploy/linux/bahad.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bahad
sudo cp deploy/linux/Caddyfile /etc/caddy/Caddyfile && sudoedit /etc/caddy/Caddyfile   # set the domain
sudo systemctl reload caddy
curl -fsS https://<your-domain>/api/health     # {"ok":true}
```

**Updating:** `cd /opt/bahad/src && sudo -u bahad git pull && sudo -u bahad ./deploy/linux/build-release.sh && sudo systemctl restart bahad`. Also run `pnpm db:migrate` (with `--shim` for option B) when `supabase/migrations/` changed. Old releases stay in `/opt/bahad/releases/` (newest 5) for rollback: point `/opt/bahad/current` back and restart.

**Logs:** `journalctl -u bahad -f`.

### Push + cleanup without `BAHAD_INTERNAL_CRON`
```bash
printf 'x-cron-secret: %s\n' "<CRON_SECRET>" | sudo tee /etc/bahad/cron-header >/dev/null
sudo chown bahad:bahad /etc/bahad/cron-header && sudo chmod 600 /etc/bahad/cron-header
sudo cp deploy/linux/bahad-{push,daily}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bahad-push.timer bahad-daily.timer
```
(The secret goes in a header file, not on the `curl` command line, so other users on the box can't see it in `ps`.)

### Weekly encrypted backup
```bash
age-keygen -o owner-backup-key.txt     # do this on the OWNER's computer; keep the private key OFF the server
# put the printed public key (age1…) in /etc/bahad/backup.env:
#   DATABASE_URL=…   BACKUP_AGE_RECIPIENT=age1…   BACKUP_DIR=/var/backups/bahad
sudo install -d -o bahad -g bahad -m 700 /var/backups/bahad
sudo cp deploy/linux/bahad-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bahad-backup.timer
sudo systemctl start bahad-backup && ls -l /var/backups/bahad
```
Copy backups off the box too, to the place the owner chose (plan Q7). A backup that only lives on the server you are protecting isn't a backup.

---

## 5. Reverse-proxy requirements (whichever proxy you use)

1. **Forward the original `Host` header.** The API's CSRF check compares the browser's `Origin` with `Host` / `X-Forwarded-Host`; the wrong Host means every API call returns 403. (Caddy does this by default; for nginx see `proxy_set_header Host $host`.)
2. **Send `X-Forwarded-Proto: https`.** The portal adds `upgrade-insecure-requests` to its CSP only on HTTPS.
3. **Don't buffer `/api/platform/events`** (SSE) and allow long reads. The server sends a ping every 25 s and `X-Accel-Buffering: no`; Caddy needs `flush_interval -1`, nginx `proxy_buffering off` + `proxy_read_timeout 1h`.
4. **Don't let the proxy cache** HTML or `/api/*`. Auth responses set `Cache-Control: private, no-store`.
5. Don't add your own `Content-Security-Policy`. The app sets a per-request nonce CSP for pages and a sandbox CSP for `/apps/*`, and a second policy from the proxy would break one of them.

---

## 6. Supabase / Google settings that change with the URL

When the site moves from `*.vercel.app` to your Linux domain:
- Supabase → Authentication → URL Configuration: **Site URL** = `https://<your-domain>`, and add `https://<your-domain>/auth/callback` to **Redirect URLs**.
- Google Cloud OAuth client: nothing changes. Its redirect URI is Supabase's (`https://<project>.supabase.co/auth/v1/callback`), not yours.
- If you used `supabase/cron.sql` (option "Vercel"), unschedule it (`select cron.unschedule('bahad-push'); select cron.unschedule('bahad-daily');`) once the Linux box sends push itself, or re-create it with the new URL.
- `NEXT_PUBLIC_SITE_URL` and the GitHub repository variable `SITE_URL` (keep-alive workflow) → the new domain.
- VAPID keys: **keep the same keys** when moving. New keys invalidate every phone's notification subscription.

---

## 7. Option B: own Postgres, details

- `pnpm db:migrate --shim` installs `supabase/local/00_auth_shim.sql` first. It creates the `anon` / `authenticated` / `service_role` roles, an `auth.users` table and `auth.uid()`, so the same migrations and RLS policies work unchanged.
- `DATABASE_URL` should use a **dedicated role that owns the tables** (the one that ran the migrations). Table owners bypass RLS, which is how the server applies the rules itself; browsers never connect to this database.
- `BAHAD_AUTH_SHIM=1` mirrors each Google identity (from Supabase Auth) into the local `auth.users` on first sign-in. Blocking and deleting users still go through the Supabase Auth admin API (`SUPABASE_SERVICE_ROLE_KEY`) **and** the local row.
- Moving data from Supabase to the box: run `scripts/backup.sh` against Supabase. Then, on the box, create an empty database, apply **only** the shim (`psql "$DATABASE_URL" -f supabase/local/00_auth_shim.sql`), and restore: `age -d -i key.txt bahad-….sql.gz.age | gunzip | psql "$DATABASE_URL"`. The backup holds the identities, then the whole `public` schema (including `bahad_migrations`, so later `pnpm db:migrate --shim` runs know what's applied), then `supabase/post-restore.sql`. Don't run `pnpm db:migrate` before restoring.
- `pg_cron` is not required on the box. Use `BAHAD_INTERNAL_CRON=1` or the systemd timers.

---

## 8. Checklist after moving to Linux

- [ ] `curl https://<domain>/api/health` → `{"ok":true}`
- [ ] Google sign-in → onboarding → approval works (Supabase redirect URLs updated)
- [ ] Two phones on the same app: a change on one appears on the other without reloading (SSE through the proxy)
- [ ] Profile → "שליחת בדיקה" arrives on Android/desktop; "בדיקה בעוד דקה" arrives about a minute later (cron/timer running)
- [ ] `journalctl -u bahad` has no errors; `systemctl list-timers` shows the timers (if used)
- [ ] A backup file exists, and a **test restore** into a scratch database succeeds
- [ ] `https://<domain>/apps/<any-simple-app>/index.html` response has `Content-Security-Policy: sandbox …` (`curl -sI`)
