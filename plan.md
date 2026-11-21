---
title: Bahad 1 Sites — Full Plan
created: 2026-11-17
status: approved-for-build
source: "[[main site definition]]"
---

# Bahad 1 Sites — Full Plan (אתר הבית של גדוד אלון)

A home portal for Alon battalion cadets. Every tool (laundry schedule, logistics shortages, combined schedule, AI learning modules, …) is an **app** inside the portal. Users sign in once; every app knows who they are.

Other cadets build apps, submit them as **pull requests on GitHub**, and the owner integrates them with AI. A **developer prompt site** inside the portal teaches contributors (and their AI) exactly how to build an app that plugs in.

## Contents
1. [[#01 — Decisions|Decisions]] — every decision made so far and why
2. [[#02 — Architecture|Architecture]] — stack, repo layout, hosting, environments
3. [[#03 — Auth and Users|Auth and Users]] — Google sign-in, approval flow, roles, units
4. [[#04 — App Registry|App Registry]] — the `app.json` manifest, tags, permissions (scopes)
5. [[#05 — Platform API|Platform API]] — `bahad.js` / `@/platform`: user info, data, live updates, push
6. [[#06 — Data Model|Data Model]] — database tables and security rules
7. [[#07 — Main Site|Main Site]] — home page, app host, PWA and push, design
8. [[#08 — Contributor Workflow|Contributor Workflow]] — fork → PR → checks → AI review → merge
9. [[#09 — Prompt Site|Prompt Site]] — the developer docs app, starter prompt, `llms.txt`
10. [[#10 — Security and OPSEC|Security and OPSEC]] — threat model, information-security rules
11. [[#11 — Roadmap|Roadmap]] — phases with "done when" criteria
12. [[#12 — Open Questions and Risks|Open Questions and Risks]] — what still needs your input

## One-paragraph summary
A single **Next.js + TypeScript** project hosted on **Vercel**, with **Supabase** for Google login, the Postgres database and live updates. Apps come in two tiers. **Simple apps** are plain HTML/JS that run in a locked-down sandbox and talk to the portal only through `bahad.js`. **Full apps** are Next.js pages from a template and use the same API. Each app declares its name, tags and permissions in an `app.json` manifest. The home page is generated from these manifests and offers search and tag filters. Users are approved by an admin and have a role (cadet / commander / admin) and a unit (company / platoon). The portal installs on phones as an app and can send push notifications.

---

# 01 — Decisions

Decided on 2026-11-17 during planning Q&A.

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | Login | **Google sign-in + admin approval** | No public "Sign in with IDF" (OAuth/SSO) exists for outside developers, and the portal must never ask for IDF credentials (that's phishing and breaks security rules). Google is free and secure, and approval keeps outsiders out. Login is a swappable layer, so official IDF SSO can replace it later without touching apps. |
| D2 | Structure | **One project; apps are folders** | Shared login is automatic, there's one deployment, and adding an app is cheapest. |
| D3 | Audience | **Alon battalion only** | Roughly hundreds of users. Structure: battalion → company (פלוגה) → platoon (מחלקה). |
| D4 | Contribution | **Pull request to the main repo** | Contributors fork, add `apps/<slug>/`, and open a PR. The owner reviews with AI and merges. Automatic checks run on every PR. |
| D5 | App tech | **Two tiers**: *simple* (HTML/JS + `bahad.js`) and *full* (Next.js + TS template) | Anyone using ChatGPT can make a simple app. Bigger apps get the full stack. Both use the **same API**. |
| D6 | User data for apps | **Name + picture, role, unit (company/platoon), email/phone** | Email/phone is a **sensitive scope**. An app gets it only if its manifest asks for it and the owner approves that in PR review. |
| D7 | App storage | **Shared data API** | Every app gets isolated storage through the API. No database work for contributors. Apps can't touch each other's data or the users table. |
| D8 | Home features v1 | **Search + tag filter**, **installable phone app (PWA) + push** | Favorites, recents and announcements are deferred (see [[#11 — Roadmap|Roadmap]] backlog). |
| D9 | Design | **Clean modern, Hebrew RTL, light/dark, Alon battalion accent color** | Logo and color still to be supplied ([[#12 — Open Questions and Risks|Open Questions and Risks]]). |
| D10 | Plan location | **This vault, as linked notes** | — |

## Principles every later decision must follow
1. **Security over convenience**: contributed code is untrusted until reviewed, and even after review it runs with the minimum access it needs.
2. **One API, documented in one place**: the docs, the prompt site and `llms.txt` are generated from the same source, so they never drift apart.
3. **Phone first**: almost every user is on a phone, often with a poor connection.
4. **Free to run**: everything fits free tiers at battalion scale.
5. **Handover-ready**: the owner finishes the course. Everything must be documented well enough for someone else (and their AI) to take over.

---

# 02 — Architecture

## Stack
| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Use the current stable version when the project is set up. |
| Styling | **Tailwind CSS**, logical properties (`ms-*`, `me-*`, `ps-*`) | Required so RTL works by default. The component library is picked in Phase 1 only after RTL is verified. |
| Auth + DB + Realtime | **Supabase** (Google provider, Postgres, Realtime) | Free tier. See [[#03 — Auth and Users|Auth and Users]], [[#06 — Data Model|Data Model]]. |
| Hosting | **Vercel** | Free (Hobby) tier. Every PR gets an automatic **preview deployment**, which makes reviewing easy. |
| Scheduled jobs | **Supabase `pg_cron`** | Vercel Hobby cron runs only once a day, which is too slow for "laundry starts in 10 min" reminders. |
| Push | **Web Push (VAPID) + service worker**, `web-push` library on the server | See [[#07 — Main Site|Main Site]]. |
| Validation | **zod** | Used for manifests, API inputs and app data schemas. |
| Package manager | **pnpm** | — |
| CI | **GitHub Actions** | See [[#08 — Contributor Workflow|Contributor Workflow]]. |

## Repository layout
The repo lives in `~/dev/bahad_1_sites/main_site/` (name of the GitHub repo: see [[#12 — Open Questions and Risks|Open Questions and Risks]]).

```
main_site/
├─ apps/                         ← EVERYTHING app-specific lives here (one folder per app)
│  ├─ tags.json                  ← the allowed tag list (#לומדות, #לוגיסטיקה, …)
│  ├─ laundry/                   ← example FULL app
│  │  ├─ app.json                ← manifest (see 04)
│  │  ├─ icon.svg
│  │  ├─ README.md
│  │  └─ src/                    ← React components / logic for the app
│  └─ nav-trainer/               ← example SIMPLE app
│     ├─ app.json
│     ├─ icon.svg
│     ├─ README.md
│     └─ site/                   ← static files: index.html, *.js, *.css, images
├─ src/
│  ├─ app/                       ← Next.js routes
│  │  ├─ page.tsx                ← home (app grid, search, tags)
│  │  ├─ onboarding/             ← first sign-in form
│  │  ├─ pending/                ← "waiting for approval"
│  │  ├─ profile/                ← my details + what apps can see + notifications toggle
│  │  ├─ admin/                  ← users, units, app kill switch
│  │  ├─ dev/                    ← the prompt site (public, see 09)
│  │  ├─ a/[slug]/page.tsx       ← host page for SIMPLE apps (sandboxed iframe)
│  │  ├─ a/laundry/…             ← thin route files for FULL apps (import from apps/laundry/src)
│  │  └─ api/platform/…          ← the Platform API (see 05)
│  ├─ platform/                  ← server + client implementation of the Platform API
│  ├─ generated/registry.ts      ← built from apps/*/app.json (never edited by hand)
│  └─ components/                ← shared UI (portal shell, tiles, buttons)
├─ public/
│  ├─ bahad.js                   ← the client helper for simple apps (built from src/platform/client)
│  └─ apps/<slug>/…              ← copied from apps/<slug>/site at build time (simple apps)
├─ docs/platform/*.md            ← single source for API docs → prompt site + /llms.txt
├─ scripts/
│  ├─ build-registry.ts          ← validates manifests, generates registry, copies simple-app files
│  └─ check-pr-paths.ts          ← CI: a PR may only touch its own app's folders
├─ supabase/migrations/*.sql     ← database schema (see 06)
├─ CLAUDE.md                     ← rules for AI working in this repo (also AGENTS.md)
├─ CONTRIBUTING.md
└─ .github/ (workflows, PR template, CODEOWNERS)
```

**Why this layout:** a contributor's PR touches only `apps/<slug>/` (plus, for full apps, `src/app/a/<slug>/`). CI enforces that rule, so reviewing a PR means reviewing one folder.

## Routing
| URL | What |
|---|---|
| `/` | Home: app grid (requires approved user) |
| `/a/<slug>` | Opens an app. A full app has its own static route, which Next.js matches before the dynamic `[slug]` route. Any other slug renders the sandboxed iframe host. |
| `/apps/<slug>/…` | Raw static files of simple apps. Served with a **CSP sandbox header**, see [[#10 — Security and OPSEC|Security and OPSEC]]. |
| `/dev`, `/llms.txt` | Developer docs and prompts (public, no secrets) |
| `/admin` | Admin only |
| `/api/platform/*` | Platform API (session cookie + app identity) |

## Environments
| Env | Hosting | Database | Who |
|---|---|---|---|
| Local | `pnpm dev` | Local mock mode (fake users, no Google needed) or the dev Supabase project | Developers |
| Preview | Vercel preview per PR | **Separate "dev" Supabase project** | Owner reviewing PRs |
| Production | Vercel production | "prod" Supabase project | Battalion |

The two Supabase projects fit the free tier (2 projects). Google OAuth redirect URLs must include the Vercel preview pattern for the dev project.

## Build pipeline
`pnpm build` runs `scripts/build-registry.ts` first:
1. Read every `apps/*/app.json` and validate it with the zod schema ([[#04 — App Registry|App Registry]]). Fail the build on any error.
2. Check tags against `apps/tags.json`, slug uniqueness, that the icon exists, and the tier/folder consistency (simple ⇒ `site/index.html` exists; full ⇒ `src/app/a/<slug>/page.tsx` exists).
3. Generate `src/generated/registry.ts`.
4. Copy `apps/<slug>/site/**` → `public/apps/<slug>/**`.

Then `next build`.

---

# 03 — Auth and Users

## Sign-in
- **Supabase Auth with Google** (scopes: `openid email profile` only, so Google's sensitive-scope review isn't needed).
- Sessions are stored in cookies via `@supabase/ssr`, so server pages, Next.js middleware and the Platform API all see the same session.
- Google Cloud OAuth consent screen: switch it from **Testing** (limited to 100 listed test users) to **In production** before launch.
- The portal must **never** show anything that looks like an IDF login, use the IDF emblem, or put "idf" in the domain. It's an unofficial, cadet-made tool, and the footer says so.
- **Swappable:** all auth code lives in `src/platform/auth/`. Apps only call `user.me()`. Moving to an official IDF identity provider later (if one is ever granted) changes only this folder.

## Lifecycle of a user
```
Google sign-in ─► profile created automatically (status = pending)
              ─► /onboarding: full name (Hebrew), company, platoon, phone (optional)
              ─► /pending: "waiting for approval" screen
admin (or commander, see 12) approves ─► status = approved ─► home page
admin can: edit unit, change role, block (status = blocked → signed out everywhere)
```
- A database trigger on `auth.users` creates the `profiles` row ([[#06 — Data Model|Data Model]]).
- **Middleware** guards every route except `/dev`, `/llms.txt` and the auth callback. Not signed in goes to sign-in. `pending` goes to `/onboarding` or `/pending`. `blocked` goes to a blocked page.
- The Platform API **re-checks** `status = approved` on every call. Middleware alone isn't trusted.

## Roles
| Role | Can |
|---|---|
| `cadet` | Use apps |
| `commander` | Cadet abilities, plus "moderator" powers inside apps that enable them, limited to **their company**. Can send push to their company if the app allows it. |
| `admin` | Everything: approve users, edit roles/units, hide apps (kill switch), see the audit log |

Every role change and approval is written to `audit_log`.

## Unit structure
- `companies` and `platoons` tables, managed in `/admin`.
- Each user belongs to one company and one platoon (commanders may have only a company).
- Apps receive `company` and `platoon` as `{ id, name }`.

## What apps can see (scopes) — see [[#04 — App Registry|App Registry]]
| Scope | Fields | Default |
|---|---|---|
| `profile` | `id`, `name`, `avatarUrl` | always granted |
| `role` | `role` | granted if declared |
| `unit` | `company`, `platoon` | granted if declared |
| `contact` ⚠️ | `email`, `phone` | **sensitive**: declared in the manifest, flagged by CI, explicitly approved in PR review |

The `/profile` page shows each user which apps can see their contact details. **Never collected anywhere: personal number (מ.א.), ID number, address, medical info.**

---

# 04 — App Registry

Every app has `apps/<slug>/app.json`. The home page, permissions and data rules all come from this file.

## Example
```json
{
  "slug": "laundry",
  "name": "לו\"ז מכונות כביסה",
  "description": "שריון תור למכונות הכביסה והמייבשים",
  "tier": "full",
  "icon": "icon.svg",
  "tags": ["יומיומי", "לוגיסטיקה"],
  "authors": ["github-username"],
  "status": "live",
  "audience": ["cadet", "commander", "admin"],
  "scopes": ["profile", "unit", "push"],
  "collections": {
    "bookings": {
      "read": "platoon",
      "create": "any",
      "moderate": "commander",
      "maxPerUser": 3
    }
  },
  "version": "1.0.0"
}
```

## Fields
| Field | Required | Rules |
|---|---|---|
| `slug` | ✔ | `a-z0-9-`, 3–32 chars, unique, equals the folder name, never changes after launch |
| `name` | ✔ | Hebrew display name, ≤ 30 chars |
| `description` | ✔ | ≤ 120 chars |
| `tier` | ✔ | `simple` or `full` |
| `icon` | ✔ | SVG (or PNG ≥ 192 px) inside the app folder |
| `tags` | ✔ | 1–3 tags, each must exist in `apps/tags.json` |
| `authors` | ✔ | GitHub usernames (they become CODEOWNERS of the folder) |
| `status` | ✔ | `live` or `hidden` (only admins see it) |
| `audience` | – | Roles that see the app. Default: all |
| `scopes` | – | Subset of `profile`, `role`, `unit`, `contact`, `data`, `push`. `profile` is implicit. `data` is implied when `collections` exist. |
| `collections` | – | Data rules per collection, see below |
| `version` | ✔ | semver, bumped on each change |

## Tags (`apps/tags.json`)
A fixed, owner-controlled list stops near-duplicates (`#לומדות` vs `#לומדה`). Starting list (editable):
`לומדות`, `לוגיסטיקה`, `לו"ז`, `יומיומי`, `AI`, `פיקוד`, `כלים`.
Adding a new tag happens in a separate small PR by the owner.

## Collection rules
| Key | Values | Meaning |
|---|---|---|
| `read` | `own` / `platoon` / `company` / `all` | Which records a regular user sees, measured against the record owner's **current** unit |
| `create` | `any` / `commander` / `admin` | Who can add records (`commander` also lets admins add) |
| `moderate` | `none` / `commander` / `admin` | Role that can read **all** records and update/delete **any** record. A commander is limited to their company. Default: `admin`. |
| `maxPerUser` | number | Optional cap on records per user |
| `schema` | JSON Schema | Optional. The server validates every write against it. |

Users can always update and delete **their own** records.

## Kill switch
Table `app_overrides` lets an admin set any app to `hidden` (or `disabled`) from `/admin` instantly, with no redeploy. While disabled, the Platform API refuses all calls from that app.

---

# 05 — Platform API

**One API, two ways to load it:**
- **Simple apps:** `<script src="/bahad.js"></script>` gives a global `bahad` object. It talks to the portal through `postMessage` (the app runs in a sandbox, see [[#07 — Main Site|Main Site]]).
- **Full apps:** `import { bahad } from "@/platform/client"` in client components, and `import { platformFor } from "@/platform/server"` in server code. Same method names, same types.

All methods are `async`, and all errors are `BahadError { code, message }`. Codes: `unauthorized`, `forbidden`, `not_found`, `invalid`, `rate_limited`, `app_disabled`.

## Reference
```ts
await bahad.ready();                    // connected to the portal (or mock mode)

// ── user ──────────────────────────────────────────────
const me = await bahad.user.me();
// { id, name, avatarUrl,
//   role?,            // if scope "role"
//   company?, platoon?, // { id, name } if scope "unit"
//   email?, phone? }  // if scope "contact"

// ── data (per-app, per-collection; rules from app.json) ───
const bookings = bahad.data.collection("bookings");
const rec = await bookings.add({ machine: 2, start: "2026-11-20T18:00:00+02:00" });
const list = await bookings.list({ where: { machine: 2 }, order: "createdAt:desc", limit: 50 });
const one  = await bookings.get(rec.id);
await bookings.update(rec.id, { machine: 3 });   // shallow merge into data
await bookings.remove(rec.id);
const stop = bookings.subscribe(() => reload());  // fires when the collection changes
// Record = { id, data, owner: { id, name }, mine: boolean, createdAt, updatedAt }

// ── push (scope "push") ───────────────────────────────
await bahad.push.notify({ to: "me", title: "המכונה מתפנה", body: "בעוד 10 דק'", at: "2026-11-20T17:50:00+02:00" });
await bahad.push.notify({ to: { platoon: "<id>" }, title, body }); // commander/admin only

// ── ui ────────────────────────────────────────────────
bahad.ui.setTitle("מכונה 2");           // portal top bar
bahad.ui.toast("נשמר ✔");
bahad.ui.home();                        // back to the portal
```

## Rules of the implementation
1. **The app's identity comes from the host, never from the app.** For simple apps, the portal knows which iframe sent a message (it checks `event.source`). For full apps, `platformFor("<slug>")` is bound at the route. An app can't claim to be another app.
2. **Every call is checked on the server** (`/api/platform/*`): the session is valid, the user is `approved`, the app isn't disabled, the app has the scope, the user's role is in `audience`, and the collection rule allows the action.
3. `where` supports **equality on top-level keys only** (JSON containment). `limit` ≤ 200. `order` is `createdAt` or `updatedAt`.
4. **Limits:** record ≤ 16 KB, 60 writes/min per user per app, 1,000 records per collection per user (or `maxPerUser`), and push: 20/day per user per app.
5. **Live updates:** after each write, the server broadcasts a *"collection changed"* signal (with no data) on a private Supabase Realtime channel for that app and collection. The client then re-fetches through the API, so permission checks stay in one place and no data leaks through realtime.
6. **Mock mode:** when `bahad.js` runs outside the portal (opened as a local file, or `window.parent === window`), it uses a fake user and stores data in memory/`localStorage`. It shows a small "מצב פיתוח" badge. Contributors can build and test a simple app without any account or server.
7. **Versioning:** the API is `v1`. Breaking changes require `v2` running alongside `v1` and a migration note in the docs.

## Transport (simple apps)
`bahad.js` sends `{ v: 1, id, method, params }` to `window.parent`. The portal host page:
- Only accepts messages whose `event.source` is its own iframe.
- Forwards the call to `/api/platform/...` with the app slug taken from the URL.
- Replies with `{ id, result | error }`.
Push and realtime signals are relayed to the iframe the same way.

---

# 06 — Data Model

All tables live in Supabase Postgres, with **Row Level Security enabled on every table**. The browser only ever reads its own profile directly. Everything else goes through server code (the Platform API and admin actions), which uses the service key on the server only and applies the rules in [[#04 — App Registry|App Registry]].

```sql
create type user_role   as enum ('cadet', 'commander', 'admin');
create type user_status as enum ('pending', 'approved', 'blocked');

create table companies (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int  not null default 0
);

create table platoons (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name       text not null,
  unique (company_id, name)
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  phone       text,
  company_id  uuid references companies(id),
  platoon_id  uuid references platoons(id),
  role        user_role   not null default 'cadet',
  status      user_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles(id)
);

create table app_records (
  id          uuid primary key default gen_random_uuid(),
  app_slug    text not null,
  collection  text not null,
  owner_id    uuid not null references profiles(id) on delete cascade,
  data        jsonb not null check (pg_column_size(data) <= 16384),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index app_records_lookup on app_records (app_slug, collection, created_at desc);
create index app_records_owner  on app_records (app_slug, collection, owner_id);
create index app_records_data   on app_records using gin (data jsonb_path_ops);

create table app_overrides (
  app_slug   text primary key,
  status     text not null check (status in ('hidden', 'disabled')),
  reason     text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table push_queue (
  id         uuid primary key default gen_random_uuid(),
  app_slug   text not null,
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  body       text,
  url        text,
  send_at    timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index push_queue_due on push_queue (send_at) where sent_at is null;

create table audit_log (
  id       bigint generated always as identity primary key,
  actor_id uuid references profiles(id),
  action   text not null,          -- 'user.approve', 'user.role', 'app.disable', …
  target   text,
  details  jsonb,
  at       timestamptz not null default now()
);
```

## Security rules (RLS)
- `profiles`: a user can `select` **their own row**. All writes go through server actions (onboarding, admin) so users can't change their own `role` or `status`.
- Every other table: **no client policies**, so direct browser access is denied. Only server code touches them.
- A trigger on `auth.users` insert creates the `profiles` row (`email`, `full_name`, `avatar_url` from Google).
- A trigger keeps `app_records.updated_at` current.

## Scheduled jobs (`pg_cron`)
- **Every minute:** call the portal's `/api/cron/push` endpoint (via `pg_net`, with a secret header). It sends due `push_queue` rows and deletes subscriptions that the push service reports as expired (HTTP 404/410).
- **Daily:** delete sent push rows older than 30 days.

## Backups
The Supabase free tier keeps no backups you can download. A weekly **encrypted** export (`pg_dump`) goes to a private location the owner chooses. See [[#12 — Open Questions and Risks|Open Questions and Risks]].

---

# 07 — Main Site

## Home page (`/`)
```
┌───────────────────────────────┐
│ ☰  אתר הבית — גדוד אלון   (👤) │  top bar, avatar → /profile
│ ערב טוב, ישראל                 │  greeting by time of day
│ [🔍 חיפוש אפליקציה…        ]   │
│ (הכל)(לומדות)(לוגיסטיקה)(לו"ז)→│  tag chips, scroll sideways
│ ┌────┐ ┌────┐ ┌────┐          │
│ │ 🧺 │ │ 🧭 │ │ 📦 │          │  app grid: icon + name
│ │כביסה│ │ניווט│ │חוסרים│        │
│ └────┘ └────┘ └────┘          │
└───────────────────────────────┘
```
- **Search:** matches name, description and tags. Hebrew-aware: ignores niqqud and quote/geresh differences (`לו"ז` = `לוז`).
- **Tag filter:** single-select chips, synced to the URL (`/?tag=לומדות`) so a filtered view can be shared.
- Shows only apps with status `live` whose `audience` includes the user's role, minus any app hidden by an admin.
- Empty state, loading skeletons, and offline banner.

## App host (`/a/<slug>`)
- A thin top bar (back arrow, app name, ⋮ menu: "דווח על בעיה", "על האפליקציה"). The rest of the screen is the app.
- **Simple apps** load in an iframe with `sandbox="allow-scripts allow-forms allow-popups"`. There's no `allow-same-origin`, so the app can't read the portal's cookies or storage.
- **Full apps** render as normal Next.js pages inside the same shell.

## PWA (installable phone app) + push
- `app/manifest.ts`: name, Hebrew `short_name`, icons (192/512 + maskable), `dir: "rtl"`, `lang: "he"`, `display: "standalone"`, and the theme color = battalion accent.
- Service worker (`public/sw.js`): handles push and notification clicks (opens the app's URL), and caches the app shell so the portal opens with a weak connection.
- **Install flow:** Android/Chrome shows a native install button (`beforeinstallprompt`). **iPhone:** a short illustrated guide (Share → "הוספה למסך הבית"). Web push on iPhone **only works after the site is installed to the home screen** (iOS 16.4+), so the guide explains that.
- **Notification permission** is requested only when the user taps "הפעל התראות" (in `/profile` or when an app asks). iOS requires this, and it's better UX.
- One user can have several devices. Each device's subscription is stored separately.

## Profile (`/profile`)
Name, unit, role (read-only), phone (editable), notification on/off per device, the list of "apps that can see my contact details", and a sign-out button.

## Admin (`/admin`)
- **Users:** pending queue (approve/reject), search, edit unit and role, block.
- **Units:** companies and platoons.
- **Apps:** list with status and the kill switch.
- **Audit log.**

## Design system
- **Hebrew RTL** (`<html lang="he" dir="rtl">`). Font: **Heebo** (via `next/font`, self-hosted, so there are no external requests).
- **Clean modern:** generous spacing, rounded tiles, light and dark mode (follows the phone setting, with a manual toggle).
- **Accent color:** Alon battalion color (to be supplied). Until then, a neutral placeholder token `--accent`.
- Design tokens are CSS variables, exported to apps: simple apps can `<link href="/bahad.css">` to look native, and full apps use the shared components.
- **Accessibility:** contrast AA, focus rings, tap targets ≥ 44 px, `aria` labels in Hebrew.
- The footer says "כלי לא רשמי שנבנה ע"י חניכי גדוד אלון", and has a contact link.

---

# 08 — Contributor Workflow

## For the contributor (cadet with an idea)
1. Read `/dev` (the prompt site, [[#09 — Prompt Site|Prompt Site]]). Copy the **starter prompt** into their AI along with their idea.
2. **Simple app:** build `index.html` + `bahad.js` and open it locally (mock mode works with no account). **Full app:** fork the repo and run `pnpm dev` in mock mode.
3. Fork `main_site` on GitHub and add `apps/<slug>/` (plus `src/app/a/<slug>/` for a full app).
4. Open a PR using the PR template (what it does, screenshots, scopes requested and why).

Non-coders who can't use GitHub can send the folder as a zip to the owner, who opens the PR for them.

## Automatic checks (GitHub Actions, on every PR)
| Check | Fails when |
|---|---|
| Install + typecheck + lint + build | Anything breaks |
| Manifest validation | `app.json` doesn't match the schema, tags are unknown, the slug is taken, or the icon is missing |
| **Path guard** | The PR touches files outside its own app's folders. Core changes need the `core` label, which only the owner can add. |
| **Scope diff** | Comments on the PR (needs owner approval) when an app adds `contact` or `push`, or loosens a collection's `read` rule |
| Simple-app static scan | Finds external URLs in `<script src>`, `fetch(`/`XMLHttpRequest`/`WebSocket` to other hosts, `eval`/`new Function`, or `localStorage` used for anything other than mock mode. This is a heuristic; the real protection is the sandbox and CSP ([[#10 — Security and OPSEC|Security and OPSEC]]). |
| Size | The app folder is larger than 5 MB |

The **Vercel preview** link appears on the PR, connected to the *dev* database, so the owner can click through the real app before merging.

## For the owner (reviewing with AI)
The repo's `CLAUDE.md` contains the full rules, so Claude Code (or any AI) reviewing a PR knows them. The review prompt is kept in `docs/review-prompt.md`:
> Review PR #N against CLAUDE.md and CONTRIBUTING.md. Check: (1) only touches its app folders; (2) uses only the Platform API for user/data; (3) requests the minimum scopes and justifies `contact`/`push`; (4) collection rules don't expose data more widely than needed; (5) no external network calls, no tracking, no secrets; (6) no sensitive military information in content; (7) Hebrew RTL, mobile layout, accessible; (8) builds and works in the preview. List blocking issues first, then suggestions, then a fixed version of anything trivial.

**Merge checklist** (from the PR template): checks green, preview tested on a phone, scopes justified, content OK under OPSEC, and authors listed. After merging, Vercel deploys to production automatically.

## Ownership
- `CODEOWNERS`: the owner owns everything. Each app's authors also own `apps/<slug>/`, so they're asked to review changes to their app.
- Branch protection on `main`: PRs only, checks must pass, and the owner's approval is required.

---

# 09 — Prompt Site

Lives at `/dev` inside the portal. It's **public**, since it holds no secrets and AI tools need to read it. It's also listed on the home page as an app tagged `כלים`.

## Pages
1. **ברוכים הבאים:** what the portal is, the two tiers, and how to choose one (rule of thumb: start simple).
2. **Starter prompt (with a copy button):** separate versions for the simple and full tiers. The contributor pastes it into ChatGPT/Claude and then describes their idea.
3. **`app.json` reference:** all fields and allowed tags, with examples ([[#04 — App Registry|App Registry]]).
4. **API reference:** every method with an example ([[#05 — Platform API|Platform API]]).
5. **Data rules cookbook:** typical recipes: "personal list" (`read: own`), "platoon board" (`read: platoon`), "commander-only announcements" (`create: commander`, `read: company`).
6. **Rules (חוקים):** forbidden things, OPSEC, and design requirements (RTL, mobile, `bahad.css`).
7. **Submitting:** the GitHub flow step by step with screenshots, plus the zip fallback.
8. **Examples:** two complete sample apps (one simple, one full) in the repo, linked.

## Machine-readable versions
- `/llms.txt`: an index with short descriptions and links (the `llms.txt` convention).
- `/llms-full.txt`: all docs in one plain-text file, which can be pasted straight into an AI.
- `/bahad.d.ts`: TypeScript types for the API, so an AI generates correct calls.

## Single source of truth
Everything above is generated from `docs/platform/*.md` and the API's TypeScript types at build time. The `CLAUDE.md` in the repo includes the same rules. Updating the docs in one place updates all of them.

## Starter prompt — draft (simple tier)
```
You are building a "simple app" for the Alon battalion portal (Hebrew, RTL, mobile-first).
Output a folder: app.json, icon.svg, README.md, site/index.html (+ optional .js/.css files).
RULES:
- Load <script src="/bahad.js"></script> and <link rel="stylesheet" href="/bahad.css">.
- Get the user ONLY via `await bahad.user.me()`. Store data ONLY via `bahad.data.collection(name)`.
- NO external network requests, CDNs, fonts, analytics, or trackers. Bundle any library locally.
- NO localStorage/cookies for real data. NO eval. NO personal numbers (מ.א.), locations, or classified info.
- <html lang="he" dir="rtl">, works on a 360px-wide phone, tap targets ≥ 44px.
- app.json must follow this schema: <schema inserted at build>. Allowed tags: <tags inserted at build>.
- Request only the scopes you need; explain any "contact" or "push" scope in README.md.
API reference: <API docs inserted at build>
Test by opening site/index.html directly; bahad.js runs in mock mode with a fake user.
Now ask me what app I want to build.
```
The full-tier prompt is the same, plus the template structure, the `@/platform` imports, and "run `pnpm dev`".

---

# 10 — Security and OPSEC

## ⚠️ Before launch
The portal is a **public website run on civilian services** (Google, Vercel, Supabase servers abroad). Before going live, **show the plan to the unit's information-security officer (קב"ם / קצין ביטחון מידע)** and get their OK on what content is allowed. In particular, ask about the **schedule (לו"ז) app** and the **logistics app**. Write down the answer in [[#12 — Open Questions and Risks|Open Questions and Risks]].

## Never on the portal
- Classified material of any level, operational or training plans, real locations or coordinates of units or activities, unit strength numbers, weapon or equipment serial numbers.
- Personal numbers (מ.א.), ID numbers, addresses, medical or mental-health information, grades/evaluations (הערכות).
- The IDF emblem, or anything presented as an official IDF system.

## Threats and protections
| Threat | Protection |
|---|---|
| Outsider signs in | Admin approval is required. The API re-checks `approved` on every call. |
| Malicious or buggy contributed app steals sessions | Simple apps run in a **sandboxed iframe without `allow-same-origin`** and get only `postMessage` access to the API. Full apps are reviewed code, and their data access still goes through the same rule-checked API. |
| Someone opens a simple app's file directly (`/apps/x/index.html`), outside the iframe | Every `/apps/*` response carries `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`. This forces the same opaque-origin sandbox even when the file is opened directly. *(Verified with a test in Phase 2.)* Stronger option later: serve simple apps from a separate domain. |
| App sends user data to an outside server | CSP on `/apps/*`: `connect-src` limited to nothing external, `script-src`/`img-src`/`font-src` limited to the app's own files and `data:`/`blob:`. Plus the CI static scan and the review. *(The exact header is verified in Phase 2.)* |
| App pretends to be another app | The app's identity comes from the host (iframe source or route), never from the message. |
| App reads more data than it should | Scopes plus collection rules, enforced on the server. Sensitive scope approved by hand. |
| User escalates their own role | `role`/`status` are changed only by server admin actions. RLS blocks direct writes. Every change is in the audit log. |
| Spam / abuse | Rate limits per user per app, push quotas, record size caps, and the kill switch. |
| Secrets leak | The service key and VAPID private key live only in Vercel/Supabase environment variables. They're never in the repo, never `NEXT_PUBLIC_*`. GitHub secret scanning is on. |
| Account takeover of the owner | 2FA on GitHub, Google, Vercel and Supabase. A second admin as backup. |

## Other measures
- Security headers on the portal: strict CSP, `X-Frame-Options`/`frame-ancestors 'self'`, HSTS, `Referrer-Policy: same-origin`.
- No analytics or trackers.
- **Data retention:** at the end of each course cycle, export what's needed, then delete `app_records` and remove users who left (the script is in the repo).

---

# 11 — Roadmap

Each phase ends with a **"done when"** checklist. Don't start the next phase until it's all checked.

## Phase 0 — Prerequisites (owner)
- [ ] Accounts with 2FA: GitHub, Vercel, Supabase, Google Cloud.
- [ ] Answers to [[#12 — Open Questions and Risks|Open Questions and Risks]] (at least the logo/color, companies/platoons list, and the קב"ם OK).
- [ ] Choose the site name and URL (`<name>.vercel.app` to start).

## Phase 1 — Foundation
- Next.js + TS + Tailwind project in `main_site/`, RTL layout, Heebo, light/dark, design tokens.
- Supabase prod and dev projects, migrations for [[#06 — Data Model|Data Model]].
- Google sign-in → onboarding → pending → approval → home. Middleware guards.
- `/admin`: users, units, audit log. `/profile`.
- CI: typecheck, lint, build. Vercel production and previews. Branch protection.
- `CLAUDE.md`, `README.md`.

**Done when:** a new Google user can sign in, fill in onboarding, get approved by the admin, and land on an empty home page. This works on Android and iPhone, in production and in a PR preview.

## Phase 2 — App platform
- `app.json` schema, `tags.json`, `build-registry.ts`, generated registry.
- Home: app grid, search (Hebrew-aware), tag chips.
- `/a/[slug]` sandboxed host, `bahad.js` (+ mock mode), `bahad.css`, `@/platform/client` + `server`.
- Platform API: `user.me`, `data.*`, live "changed" signals, scopes, collection rules, rate limits, kill switch.
- Two sample apps: `hello-simple` and `hello-full`.
- **Security tests:** a sample "evil" app tries to read cookies, call outside servers, claim another slug, read other users' `own` records, and run when opened directly. All attempts must fail.

**Done when:** both sample apps work in the portal, the security tests pass, and the API has automated tests for every collection rule.

## Phase 3 — Contributor experience
- `/dev` prompt site, `llms.txt`, `llms-full.txt`, `bahad.d.ts`, generated from `docs/platform/`.
- `CONTRIBUTING.md`, PR template, `CODEOWNERS`, path guard, scope diff, static scan, review prompt.
- **Dry run:** a friend who has never seen the code builds a small app using only `/dev` and their AI, and submits a PR.

**Done when:** the dry-run PR passes checks and is merged with no help beyond the docs (any gaps found are fixed in the docs).

## Phase 4 — Installable app + push
- Web manifest, icons, service worker, install button and iPhone guide.
- Push subscriptions, `/profile` toggle, `bahad.push.notify`, `push_queue` + `pg_cron` sender.

**Done when:** the portal installs on Android and iPhone, and a scheduled test notification arrives on both within about 1 minute of its time.

## Phase 5 — First real apps
Each gets its own short spec note in the vault before building:
1. **Laundry schedule (לו"ז מכונות כביסה):** the first real use of data, live updates and push reminders.
2. **Logistics shortages (ריכוז חוסרים):** uses `read: own` + `moderate: commander`. Content checked with the קב"ם.
3. **Combined schedule (תכלול לו"ז):** content checked with the קב"ם first.

## Phase 6 — Operations and handover
- Weekly encrypted backup, course-end cleanup script, second admin.
- `HANDOVER.md`: accounts, secrets location, how to deploy, how to review PRs with AI.

## Backlog (not in v1; candidates later)
- Favorites + recently used apps (D8).
- Announcements bar for commanders.
- **AI gateway** (`bahad.ai.chat`) for the AI learning modules: a server-side key with per-user quotas and a monthly budget cap. This needs a funding decision ([[#12 — Open Questions and Risks|Open Questions and Risks]]).
- App ratings and feedback, usage counts (privacy-preserving).
- English UI.

---

# 12 — Open Questions and Risks

## Open questions (answer before or during Phase 0/1)
| # | Question | Needed by | Answer |
|---|---|---|---|
| Q1 | Battalion **logo and accent color**? Is it OK to use the Alon battalion symbol on an unofficial site? | Phase 1 | |
| Q2 | **List of companies and platoons** in Alon. | Phase 1 | |
| Q3 | Who besides you is **admin**? Can **commanders approve** new users from their own company? | Phase 1 | |
| Q4 | **Site name and URL**: start on `*.vercel.app`, or buy a domain (≈ 40–60 ₪/year)? (Must not contain "idf".) | Phase 1 | |
| Q5 | **קב"ם approval**: what content is allowed (especially the schedule and logistics apps)? | Before launch | |
| Q6 | **GitHub repo**: personal account or a GitHub organization (better for handover)? Repo name? | Phase 1 | |
| Q7 | Where do **encrypted backups** go? | Phase 6 | |
| Q8 | **AI modules**: who pays for AI API usage, and what monthly cap? | Before the AI gateway | |
| Q9 | What happens to the **empty `logistics_site/` and `bahad_calander/` folders**? (In this plan they become apps inside `main_site/apps/`. Suggest: delete them, and keep the specs as vault notes.) | Phase 1 | |
| Q10 | **Course end date** (sets the data-retention and handover timeline). | Phase 6 | |

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Supabase free projects **pause after ~1 week with no activity** (e.g. long vacation) | Site down until resumed | Daily use keeps it awake. A daily `pg_cron`/GitHub Action ping. Resuming is one click in the dashboard. |
| Free-tier limits change | Costs | Check the current limits at setup. Battalion scale is far below them. |
| iPhone push requires home-screen install | Missed reminders | Clear install guide. In-app reminders as a fallback. |
| Contributed code quality varies | Bugs, security issues | Sandbox, server-side rules, CI checks, AI and human review, kill switch. |
| Owner leaves after the course | Project abandoned | Second admin, GitHub org, `HANDOVER.md`, `CLAUDE.md`. |
| Information-security violation | Disciplinary or security incident | קב"ם approval, "never on the portal" list, review checklist. |
| Google account bans/blocks on base networks | Can't log in | Test on base Wi-Fi early. The login layer is swappable. |
