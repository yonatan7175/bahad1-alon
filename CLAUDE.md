# CLAUDE.md — rules for AI working in this repo

This repo is the **Alon battalion portal** ([`plan.md`](plan.md) is the approved design; [`docs/PLAN-STATUS.md`](docs/PLAN-STATUS.md) tracks it). Read [`AGENTS.md`](AGENTS.md) too: this is **Next.js 16**, and its APIs differ from older versions (e.g. `proxy.ts` instead of middleware, async `params`/`cookies()`). The version-matched docs are in `node_modules/next/dist/docs/`.

## Two kinds of work
1. **App work** (most PRs): only inside `apps/<slug>/` and, for a full app, `src/app/a/<slug>/page.tsx`. CI's path guard rejects anything else unless the owner adds the `core` label.
2. **Core work** (owner only): everything else. Keep the security model below intact.

## Security model — never weaken
- **App identity comes from the host, never from the app.** Simple apps run in `<iframe sandbox="allow-scripts allow-forms allow-popups">` (NO `allow-same-origin`). The host page (`src/components/simple-app-host.tsx`) accepts only messages whose `event.source` is its own iframe and takes the slug from its URL. Full apps get the slug from their route file.
- **Every API call is re-checked on the server** (`src/platform/server/engine.ts`): session → `approved` → app exists and isn't disabled/hidden → audience → scope → collection rule → limits. Never add a shortcut that skips `executeCall`.
- `/apps/*` is served with `Content-Security-Policy: sandbox …` (`next.config.ts → SIMPLE_APP_CSP`). Portal pages get a per-request nonce CSP with `frame-src 'self'` (`src/proxy.ts`). Don't loosen either without updating `tests/e2e/security.spec.ts`.
- State-changing API routes require a same-origin `Origin` header (`isSameOrigin`). Sandboxed apps send `Origin: null` and must stay rejected.
- RLS is enabled on every table. Browsers may only `select` their own `profiles` row. All other access is server code connecting as the table owner. New tables: `enable row level security` + revoke from `anon, authenticated` (and add the same to `supabase/post-restore.sql`).
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `DATABASE_URL`) are server-only. Never prefix them `NEXT_PUBLIC_` and never commit them.
- Mock auth and PGlite are refused in production builds (`authMode()`, `getDb()`). Keep it that way.
- **"התחברות עם צ1" for outside websites** (`src/platform/auth/connect.ts`, `/oauth/authorize`, `/api/connect/*`): OAuth code + PKCE, tokens stored hashed, 24 h, read-only (the user; the directory only when the קב״מית allowed it). CORS only for the site's own origin and never with credentials; a token only works from its own site's origin. A site needs the קב״מית's approval AND an admin's. Never let a connect token reach `executeCall` or any write.

## Single sources — edit here, then regenerate
| What | Source | Generated into (`pnpm gen`) |
|---|---|---|
| API types | `src/platform/types.ts` | `/bahad.d.ts`, the docs |
| app.json schema | `src/platform/manifest.ts` | build validation, docs (JSON Schema) |
| limits | `src/platform/limits.ts` | engine + docs |
| developer docs | `docs/platform/*.md` | `/dev`, `/llms.txt`, `/llms-full.txt` |
| rules block below | `docs/platform/06-rules.md` | this file (`pnpm docs:sync`; CI fails when out of sync) |
| design tokens | `src/platform/client/tokens.css` | portal CSS + `/bahad.css` |
| app registry | `apps/*/app.json` | `src/generated/registry.ts`, `public/apps/`, `public/app-icons/` |

Never edit `src/generated/` or `public/{apps,app-icons,bahad.js,bahad.css,bahad.d.ts,llms*.txt}`; they are gitignored outputs.

## Rules for apps (same text contributors see at /dev/rules)
<!-- RULES-START (generated from docs/platform/06-rules.md — edit there, then run pnpm docs:sync) -->
## ⛔ אסור בשום מקום באתר (אבטחת מידע)
- מידע מסווג בכל רמה, תוכניות מבצעיות או תוכניות אימונים, מיקומים או נ"צ אמיתיים של יחידות ופעילויות, מצבת כוח אדם, מספרים סידוריים של נשק וציוד.
- מספר אישי (מ.א.), תעודת זהות, כתובת, מידע רפואי או נפשי, ציונים והערכות.
- סמל צה"ל, או כל דבר שמוצג כמערכת רשמית של צה"ל. **לעולם לא לבקש שם משתמש/סיסמה של צה"ל.**
- תוכן של לו"ז או לוגיסטיקה — רק במה שקצין ביטחון המידע (קב"ם) אישר.

## 🔒 חוקי קוד
1. משתמש — **רק** דרך `bahad.user.me()`. נתונים — **רק** דרך `bahad.data.collection()`.
2. **אין** בקשות רשת לשרתים חיצוניים, CDN, פונטים חיצוניים, אנליטיקס או מעקב. ספריות — מעתיקים לתוך תיקיית האפליקציה. (בפועל הפורטל חוסם את זה בכל מקרה.)
3. **אין** `eval`, `new Function`, ואין `localStorage`/cookies לנתונים אמיתיים (מותר רק במצב פיתוח).
4. אפליקציה נוגעת **רק בתיקיות שלה**: `apps/<slug>/` (ובאפליקציה מלאה גם `src/app/a/<slug>/page.tsx`). שינוי בליבה = PR נפרד של המנהל.
5. מבקשים את **ההרשאות המינימליות**. `contact` ו-`push` דורשים הסבר ב-README ואישור ידני.
6. חוקי אוסף — הצרים ביותר שעובדים (ראו [מתכונים](/dev/cookbook)).
7. בלי סודות בקוד (מפתחות, סיסמאות, טוקנים).
8. טקסט שמגיע ממשתמשים מוצג בבטחה (`textContent`, או escape לפני `innerHTML`).

## 📱 עיצוב
- `<html lang="he" dir="rtl">`, כל הטקסטים בעברית.
- עובד בטלפון ברוחב 360px; כפתורים ושדות לפחות 44px גובה.
- אפליקציה פשוטה: `<link rel="stylesheet" href="/bahad.css">` — HTML רגיל כבר נראה כמו הפורטל (`button`, `input`, `.card`, `.row`, `.badge`, `.muted`, `button.secondary`, `button.danger`).
- אפליקציה מלאה: מחלקות Tailwind לוגיות (`ms-*`/`me-*`/`ps-*`/`pe-*`) וצבעי הנושא (`bg-surface`, `text-muted`, `btn`, `card`, `field`).
- נגישות: ניגודיות טובה, `label` לכל שדה, `aria-label` בעברית לכפתורי אייקון.
<!-- RULES-END -->

## Reviewing a PR with AI
Use [`docs/review-prompt.md`](docs/review-prompt.md). Check the Vercel preview on a phone before merging. After merging a new app: `pnpm codeowners`.

## Before you finish any change
`pnpm check` (lint, types, unit tests, docs sync) and, for anything touching auth/API/host/CSP, `pnpm e2e`. All must pass. Write UI text in Hebrew, RTL, mobile-first (360 px).
