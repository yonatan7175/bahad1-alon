# Production setup (plan Phase 0 + the account parts of Phase 1)

Everything in code is done. These steps need **the owner's accounts** and can't be automated. Do them in order. Every account gets **2FA** (plan 10).

## 0. Decisions first (plan 12)
Logo/accent color (Q1) · companies/platoons list (Q2) · second admin, and whether commanders approve (Q3) · site name/URL (Q4) · **קב"ם approval (Q5)** · GitHub personal vs organization (Q6). Record the answers in `plan.md` §12.

## 1. GitHub
1. Create the repo (an **organization** is better for handover, Q6), push this folder, and enable **secret scanning**.
2. `pnpm set-owner <your-github-username>` → commit (writes `bahad.config.json`, sample app authors, `.github/CODEOWNERS`).
3. Settings → Branches → protect `main`: require PRs, require the **CI** checks (`install · lint · types · tests · build`, `end-to-end + security tests`), require review from Code Owners, no force-push.
4. Labels: create `core` and `needs-owner-approval`. Only the owner should add `core`.
5. Variables: `SITE_URL` = production URL (used by the keep-alive workflow).
6. Optional site links: set `NEXT_PUBLIC_REPO_URL=https://github.com/<org>/<repo>` (the "דווח על בעיה" menu item and the footer use it).

## 2. Supabase: two projects, `prod` and `dev` (free tier allows 2)
For **each** project:
1. Create it (region: closest to Israel, e.g. Frankfurt).
2. **Migrate:** Project Settings → Database → connection string (Session pooler, port 5432) → `DATABASE_URL=… pnpm db:migrate`.
3. **Auth → Providers → Google:** enable it and paste the Google client ID/secret (step 3).
4. **Auth → URL Configuration:** Site URL = the site's URL. Redirect URLs:
   - prod: `https://<prod-domain>/auth/callback`
   - dev: `https://*-<vercel-team>.vercel.app/auth/callback` (preview deployments) and `http://localhost:3000/auth/callback`
5. **Auth → Sign In / Providers:** disable email sign-up (Google only).
6. **Cron:** SQL editor → run `supabase/cron.sql` with the URL and `CRON_SECRET` filled in (prod only, or both).
7. Keys for the env vars: Project Settings → API (URL, anon/publishable key, **service_role key** = secret), Database (connection strings, and the CA certificate → `DATABASE_CA_CERT`).

## 3. Google Cloud (sign-in)
1. Create a project → APIs & Services → OAuth consent screen: External, app name (**never** "IDF"/צה"ל), scopes `openid email profile` only.
2. Credentials → OAuth client ID (Web): authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback` for **each** Supabase project.
3. Before launch, switch the consent screen from **Testing** to **In production** (Testing allows only 100 listed users). The basic scopes need no Google review.

## 4. Web Push keys
`pnpm vapid` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (secret), plus `VAPID_SUBJECT=mailto:<owner email>`. Use the same pair for prod forever (new keys invalidate every phone's subscription). The dev project may use a separate pair.

## 5. Vercel
1. Import the GitHub repo. Framework: Next.js. Install: `pnpm install --frozen-lockfile`. Build: `pnpm build` (default).
2. Environment variables (see `.env.example`). **Production** → prod Supabase values; **Preview** → dev Supabase values:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (**transaction pooler**, port 6543), `DATABASE_CA_CERT`, `BAHAD_ADMIN_EMAILS` (your Google email), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REPO_URL`.
   Do **not** set `BAHAD_AUTH=mock`, `BAHAD_ALLOW_MOCK`, `BAHAD_ALLOW_PGLITE` or `BAHAD_EXTRA_APPS_DIR` on Vercel.
3. Deploy. Visit `/api/health` → `{"ok":true}`.
4. Sign in with the email in `BAHAD_ADMIN_EMAILS`: you become an approved admin automatically. In `/admin`: add the companies and platoons (Q2), and approve the second admin.

## 6. Phase 1 "done when" check
A new Google user signs in → fills onboarding → admin approves → lands on the home page. Do it on **Android and iPhone**, in production **and** in a PR preview.

## 7. Before launch
- **קב"ם approval** of the plan and of each app's content before it goes `live`.
- Once Q1 is answered: put the approved emblem in `public/brand/` and set `NEXT_PUBLIC_EMBLEM_URL`; adjust the accent in `src/platform/client/tokens.css`; replace `public/icons/icon.svg` (favicon) → `pnpm icons`.
- Test base Wi-Fi: Google sign-in and the site must not be blocked (plan 12 risk).
