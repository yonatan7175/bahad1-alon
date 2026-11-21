# Plan status — what was built, what needs the owner, where it deviates

Built on 2026-11-17 from [`plan.md`](../plan.md). Legend: ✅ done and tested · 🟡 done, needs owner accounts or real devices to verify · ⬜ owner action · ↪ deviation (with reason).

## Phase 0 — prerequisites (owner)
⬜ Accounts with 2FA, answers to the open questions, site name/URL. Step-by-step: [`SETUP.md`](SETUP.md).

## Phase 1 — foundation
| Item | Status |
|---|---|
| Next.js 16 + TS + Tailwind 4, RTL, Heebo (self-hosted), light/dark + manual toggle, design tokens | ✅ |
| Migrations for the data model, RLS on every table | ✅ tested on embedded Postgres (RLS, trigger, unit checks) and over the real `pg` driver |
| Google sign-in → onboarding → home (open registration; `BAHAD_REQUIRE_APPROVAL=1` = pending → approval); route guards | ✅ flow tested in mock mode · 🟡 real Google login needs Supabase + Google setup |
| `/admin` (users, units, apps kill switch, audit log), `/profile` | ✅ |
| CI: typecheck, lint, build, tests, e2e; Vercel previews; branch protection | ✅ workflows written · ⬜ enable on GitHub/Vercel |
| `CLAUDE.md`, `README.md` | ✅ |
| **Done when** (real Google user on Android + iPhone, prod + preview) | 🟡 needs the accounts |

## Phase 2 — app platform
| Item | Status |
|---|---|
| `app.json` schema, `tags.json`, `build-registry.ts`, generated registry | ✅ |
| Home: grid, Hebrew-aware search, tag chips synced to URL | ✅ |
| `/a/[slug]` sandboxed host, `bahad.js` + mock mode, `bahad.css`, `@/platform/client` + `server` | ✅ |
| Platform API: `user.me`, `data.*`, live "changed" signals, scopes, collection rules, rate limits, kill switch | ✅ |
| Sample apps `hello-simple`, `hello-full` | removed from the site 2026-11-18 (owner); `hello-simple`, `officer-character`, `shortages` kept as e2e test fixtures in `tests/fixtures/apps/` |
| Security tests (evil app: cookies, outside servers, other slug, others' `own` records, opened directly) | ✅ all blocked: `tests/e2e/security.spec.ts` |
| **Done when**: API tests for every collection rule | ✅ all 36 read × moderate × create combinations × 8 users (`tests/unit/engine-rules.test.ts`) |

## Phase 3 — contributor experience
| Item | Status |
|---|---|
| `/dev` prompt site, `llms.txt`, `llms-full.txt`, `bahad.d.ts` from `docs/platform/` | ✅ |
| `CONTRIBUTING.md`, PR template, CODEOWNERS (generator), path guard, scope diff, static scan, review prompt | ✅ · ⬜ `pnpm set-owner` |
| Dry run by a friend | ⬜ |

## Phase 4 — push (installable app dropped by decision)
| Item | Status |
|---|---|
| ~~Web manifest, install button, iPhone install guide, offline caching~~ | ↪ **removed on 2026-11-17 at the owner's request: the portal stays a website.** |
| Push subscriptions, `/profile` toggle + test buttons, `bahad.push.notify/cancel/onReceive`, `push_queue` + sender | ✅ queue/sender/permissions unit-tested (with a fake push service). The service worker (`public/sw.js`) is push-only and registers only when a user turns notifications on. |
| `pg_cron` sender | ✅ `supabase/cron.sql` (run once per project) |
| Real notifications | 🟡 need VAPID keys + HTTPS. Android/desktop browsers: yes. **iPhone: web push only works for sites installed to the home screen, so with no install flow iPhones get no push** (apps still work; reminders just don't arrive there). |

## Phase 5 — first real apps
| App | Status |
|---|---|
| Laundry (לו"ז מכונות כביסה) — full app | ✅ v4 `live` (spec: `apps/laundry/SPEC.md`): calendar of 40-min slots, one washer + one dryer, each slot booked whole or shared by two (`capacity`), 3 washes + 3 dries per week enforced on the server, my bookings, free-slot finder, commanders free slots / mark machines broken, 10-min reminder |
| דמות הקצין — external app | ✅ write.bahad1.com inside the portal frame (new `external` tier, no API access) |
| User directory (`/people`) | ✅ owner request 2026-11-17: every approved user sees others' role, unit, phone, email; each user can hide phone/email (default shown) — **check with the קב"ם** |
| Shortages (ריכוז חוסרים) — simple app | ✅ built as `hidden` (admins only) · ⬜ קב"ם + spec before `live` |
| Combined schedule (לו"ז פלוגתי) — simple app | removed 2026-11-18 (owner) |

## Phase 6 — operations and handover
| Item | Status |
|---|---|
| Weekly encrypted backup | ✅ `scripts/backup.sh` — real backup → age encryption → restore round trip tested |
| Course-end cleanup script | ✅ `scripts/course-end-cleanup.ts` (dry-run by default) |
| Second admin | ⬜ |
| `HANDOVER.md` | ✅ template · ⬜ fill in accounts |
| Linux hosting | ✅ `LINUX.md` + `deploy/linux/` (systemd, Caddy/nginx); CI runs everything on Ubuntu |

## Deviations from the plan (and why)
| Plan said | Built | Why |
|---|---|---|
| Repo at `~/dev/bahad_1_sites/main_site/` | this folder (`bahad_1_main_site/`), its own git repo | you asked to build it here |
| Server talks to Supabase with the service key | Server uses **SQL over `DATABASE_URL`** (`pg`); the service key is used only for Realtime broadcast and the Auth admin API | the same code runs on Supabase, a Linux Postgres, and embedded Postgres in tests, so every rule is tested against real SQL. Still server-only, still bypasses RLS like the service key would. |
| Middleware routes users by status | `src/proxy.ts` (Next 16's name for middleware) refreshes the session and redirects signed-out users; status routing (`pending`/`blocked`) happens in each page's server guard | Next 16 docs: proxy is for optimistic checks only; per-page guards can't be skipped by client navigation. The API re-checks everything anyway. |
| Live updates only via Supabase Realtime | `supabase` **or** `sse` (in-process Server-Sent Events) | Linux single-box hosting and local dev without Supabase |
| Daily cleanup via `pg_cron` | `pg_cron` (Supabase) **or** `/api/cron/daily` (timer / `BAHAD_INTERNAL_CRON`) | Linux without `pg_cron` |
| Heebo via `next/font` | Heebo woff2 files self-hosted in `public/fonts`, one `@font-face` for the portal **and** simple apps | Same font files for apps inside the sandbox; no build-time download (works on an offline Linux build box) |
| Laundry example `read: "platoon"` | `read: "company"` | machines are shared by the company; platoon visibility would let two platoons double-book the same machine |
| API in the plan | **added** `bahad.isMock`, `push.cancel(id)` (notify returns `{id, recipients}`), `push.onReceive()` | cancelling a booking must cancel its reminder; the plan says push is relayed to open apps |
| `moderate` default `admin` | as planned; `moderate: "none"` means **no** moderators (admins too) | literal reading; admins still have the kill switch |
| Accent color / emblem | placeholder oak-green palette and an ORIGINAL oak mark; "בה״ד 1 · גדוד אלון" shown as text; `NEXT_PUBLIC_EMBLEM_URL` slot for the real emblem | Q1 unanswered; official insignia only after approval (plan 10 forbids presenting the site as an official IDF system) |
| PWA (plan 07, Phase 4) | removed: website only | owner decision 2026-11-17 |
| `nav-trainer` example in the layout | not built | it was only an illustration; `hello-simple` is the simple-app example |
| Users/admin bootstrap | `BAHAD_ADMIN_EMAILS` env makes the first admin | someone has to approve the first admin |
| Q3 (commanders approve) | built behind `BAHAD_COMMANDERS_CAN_APPROVE=1` (off by default) | waits for your answer |

## Known limits / residual risks
- **`allow-popups`** (as planned) lets a malicious simple app open a new window to an outside URL with data in the address. CSP can't block that. It's caught by the static scan + review, not by the sandbox. Removing `allow-popups` (in `SIMPLE_APP_SANDBOX` and `SIMPLE_APP_CSP`) closes it, at the cost of `target="_blank"` links in apps.
- Simple apps' static files under `/apps/*` are public (no login), like any app code in the repo. Data is never in them.
- Laundry/schedule have no server-side slot locking (generic API). Conflicts are resolved by "earliest record wins", which every client computes the same way.
- Real Google sign-in, Supabase Realtime, Vercel previews and real-device push are wired per the docs but could not run here (no accounts). The rest is covered by tests (see `pnpm check`, `pnpm e2e`).
