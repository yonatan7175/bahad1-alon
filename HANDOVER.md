# HANDOVER — running the portal after the owner leaves

Fill in the blanks (⬜) before the course ends (plan Phase 6). Keep this file accurate. It's the first thing the next maintainer (and their AI) reads.

## Accounts (all with 2FA)
| Service | What | Owner / backup admin |
|---|---|---|
| GitHub | repo `⬜` (organization `⬜`) | ⬜ / ⬜ |
| Vercel | project `⬜` | ⬜ / ⬜ |
| Supabase | `prod` ⬜ · `dev` ⬜ | ⬜ / ⬜ |
| Google Cloud | OAuth client `⬜` | ⬜ / ⬜ |
| Domain (if bought) | `⬜` registrar ⬜ | ⬜ |

## Where the secrets live
Never in the repo. Production values: **Vercel → Settings → Environment Variables** (or `/etc/bahad/env` on Linux). The owner's private copy: ⬜ (password manager). The backup decryption key (age): ⬜ (**not** on the server).

| Secret | Rotate how |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → roll the key → update Vercel → redeploy |
| `DATABASE_URL` password | Supabase → Database → reset password → update Vercel |
| `CRON_SECRET` | new random value → Vercel env **and** Supabase Dashboard → Vault → `bahad_cron_secret` |
| `VAPID_PRIVATE_KEY` | avoid: rotating forces every user to re-enable notifications |

## Deploying
- **Vercel:** merge to `main` and production deploys automatically. Every PR gets a preview on the `dev` database.
- **Linux:** see `LINUX.md` §4 (`deploy/linux/build-release.sh`, `systemctl restart bahad`).
- **Schema changes:** add a new file `supabase/migrations/<timestamp>_<name>.sql` (never edit applied ones), then run `pnpm db:migrate` against dev, then prod, **before** deploying code that needs it.

## Reviewing PRs with AI
1. `gh pr checkout N` (or `git fetch origin pull/N/head:pr-N`).
2. Paste `docs/review-prompt.md` into Claude Code. It reads `CLAUDE.md` for the rules.
3. Open the Vercel preview **on a phone**. Go through the PR template's merge checklist.
4. `needs-owner-approval` label → read the scope-diff comment; a `contact`/`push` scope must be justified in the app's README.
5. After merging a new app: `pnpm codeowners` and commit.

## Day-to-day admin
- `/admin`: approve users, edit role/unit, block (signs the user out everywhere), units, the **app kill switch** (hide/disable instantly, no redeploy), audit log.
- Emergency: disable an app in `/admin → אפליקציות`. Block a user in `/admin → משתמשים`.

## Backups (weekly, encrypted)
- Linux: `bahad-backup.timer` (LINUX.md §4). Vercel/Supabase-only setups: run `pnpm backup` weekly from the owner's computer with `DATABASE_URL` (session pooler) and `BACKUP_AGE_RECIPIENT` set. Store copies at ⬜ (plan Q7).
- **Restoring a backup:** create an empty database. On plain Postgres, first `psql "$URL" -f supabase/local/00_auth_shim.sql` (a fresh Supabase project already has `auth`). Then `age -d -i key.txt bahad-….sql.gz.age | gunzip | psql "$URL"`. The file restores, in order: identities → `public` schema + data (including `bahad_migrations`) → `supabase/post-restore.sql` (trigger, grants, realtime policy). Verify with `/api/health` and an admin login.
- Note: on a **new** Supabase project, Google identities get new ids when people sign in again. A full restore keeps the data, but users may need re-linking. Same-project restores and Linux option B keep everything.
- Test a restore at least once per course.

## End of course (plan 10 — data retention)
```bash
pnpm course-end export --out backups/course-end.json     # then encrypt it and delete the plain file
pnpm course-end delete-records            # dry run; add --yes   (optionally --app <slug>)
pnpm course-end remove-users --inactive-days 30   # dry run; add --yes (admins are never removed)
```
Also: remove leaving admins in `/admin`, rotate secrets they knew, and update this file.

## If Supabase paused the project
Free projects pause after about a week without activity. The keep-alive workflow pings `/api/health` daily (repo variable `SITE_URL`). If it paused anyway: Supabase dashboard → **Resume** (one click).
