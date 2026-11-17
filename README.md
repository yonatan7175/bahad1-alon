# אתר הבית — גדוד אלון (Bahad 1 portal)

A home portal for Alon battalion cadets. Every tool (laundry schedule, shortages, schedule, AI learning modules…) is an **app** inside the portal. Users sign in once with Google (approved by an admin), and every app knows who they are through one **Platform API**. Cadets build apps and submit them as GitHub pull requests. The `/dev` site teaches them (and their AI) how.

Built from [`plan.md`](plan.md). What's done and what still needs the owner: [`docs/PLAN-STATUS.md`](docs/PLAN-STATUS.md). Hosting on Linux: [`LINUX.md`](LINUX.md).

## Quick start (local, no accounts needed)

```bash
corepack enable            # pnpm 12 (pinned in package.json)
pnpm install
pnpm dev                   # http://localhost:3000 — mock login, embedded Postgres in .data/
```
Open `/signin` and pick a seeded user (admin, commander, cadets, pending). Opening the dev server from a phone/Tailscale? Set `BAHAD_DEV_ORIGINS=<ip>,<ip>` in `.env.local` (otherwise Next blocks its own scripts and no button works). Push needs VAPID keys (`pnpm vapid`), HTTPS and `BAHAD_INTERNAL_CRON=1`.

It is a **website** (no install-to-home-screen / offline mode, by decision).

## Stack
Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Google Auth, Postgres, Realtime) · Vercel · Web Push (VAPID) · zod + Ajv · pnpm · GitHub Actions. All server data access is plain SQL through one tiny adapter (`src/platform/server/db-core.ts`), so it runs on Supabase, on any Postgres (Linux), and on embedded PGlite (dev/tests) without changes.

## Layout
```
apps/<slug>/                app.json + icon + README (+ site/ for simple apps, src/ for full apps)
apps/tags.json              allowed tags (owner-controlled)
src/app/                    portal routes: / · /signin · /onboarding · /pending · /blocked · /profile · /admin · /dev · /a/[slug]
src/app/a/<slug>/page.tsx   thin route file of each FULL app
src/app/api/                platform/call (the API) · platform/events (SSE) · push/* · cron/* · health
src/platform/               types.ts (API types) · manifest.ts (app.json schema) · limits.ts · bridge.ts
  server/                   engine.ts (every API call) · rules.ts · db*.ts · push.ts · realtime.ts · registry.ts
  client/                   bahad for full apps · standalone.ts (→ /bahad.js) · tokens.css + bahad-base.css (→ /bahad.css)
  auth/                     the swappable login layer (Supabase or mock) + session lifecycle
supabase/migrations/        the schema (RLS on every table) · local/ auth shim · cron.sql · post-restore.sql
docs/platform/*.md          SINGLE SOURCE for /dev, /llms.txt, /llms-full.txt and CLAUDE.md's rules block
scripts/                    generators, CI checks, migrate, VAPID, backup, course-end cleanup
deploy/linux/               systemd units, Caddy/nginx, release build script
tests/unit · tests/e2e      vitest (rules matrix, RLS, push, tooling) · Playwright (flows + security, evil fixture app)
```

## Commands
| | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | runs `pnpm gen` first (registry, bahad.js/css, docs) |
| `pnpm check` | lint + typecheck + unit tests + docs single-source check |
| `pnpm e2e` | production build (with the evil test app, into `.next-e2e`) + Playwright flows & security tests |
| `pnpm db:migrate [--shim]` | apply migrations to `DATABASE_URL` (`--shim` = plain Postgres, not Supabase) |
| `pnpm vapid` | new Web Push key pair |
| `pnpm set-owner <github-user>` · `pnpm codeowners` | one-time owner setup · regenerate CODEOWNERS after merging an app |
| `pnpm check:paths` · `pnpm scope-diff` · `pnpm check:scan` | the PR checks, runnable locally |
| `pnpm docs:sync` | copy the rules block from `docs/platform/06-rules.md` into `CLAUDE.md` |
| `pnpm backup` · `pnpm course-end …` | encrypted backup · end-of-course export/cleanup |

## Documents
- [`docs/SETUP.md`](docs/SETUP.md): Phase 0/1 accounts and production setup, step by step
- [`CONTRIBUTING.md`](CONTRIBUTING.md): building and submitting an app (also at `/dev`)
- [`CLAUDE.md`](CLAUDE.md): rules for AI working in this repo · [`docs/review-prompt.md`](docs/review-prompt.md): PR review prompt
- [`HANDOVER.md`](HANDOVER.md): running it after the owner leaves · [`LINUX.md`](LINUX.md): Linux hosting
