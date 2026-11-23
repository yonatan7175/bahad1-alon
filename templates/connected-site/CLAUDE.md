# CLAUDE.md — a website that signs in with צ1 (גדוד אלון portal)

You are building a small website for the Alon battalion. Users sign in with their **צ1** account
(the battalion portal, https://bahad1-alon.duckdns.org) — the site has NO login of its own.

## How sign-in works (already done by connect.js — don't reimplement it)
```html
<script src="https://bahad1-alon.duckdns.org/connect.js"></script>
<script type="module">
  const user = await bahadConnect.requireUser();  // redirects to צ1 once if needed, then back here
  // user: { id, name, avatarUrl, role: "cadet"|"commander"|"admin", company, platoon, room,
  //         positions: string[], phone|null, email|null, scopes: ["profile"] or ["profile","directory"] }
  const people = await bahadConnect.people();     // the battalion directory — ONLY if user.scopes includes "directory"
  // people[]: { id, name, avatarUrl, role, company, platoon, positions, phone|null, email|null }
</script>
```
- `bahadConnect.ready()` → user or null (never redirects). `bahadConnect.signOut()`.
- Errors are `Error` objects with `.code`: `unauthorized`, `insufficient_scope`, `denied`, `rate_limited`.
- On localhost / file:// it runs in **mock mode**: a fake user and fake people, no network.
  `?mockRole=commander` / `?mockRole=admin` to test roles, `?mockNoDirectory` to test without the directory.

## Data
The portal does NOT store this site's data. If the site needs to save anything shared, it needs its own
backend (e.g. a Supabase / Firebase project, or a small server). Then:
- The browser sends `bahadConnect.token()` to YOUR server (`Authorization: Bearer <token>`).
- YOUR server calls `GET https://bahad1-alon.duckdns.org/api/connect/userinfo` with that header and uses
  the `id` it returns. **Never trust a user id / name / role sent from the browser.**
- Cache the userinfo answer for a few minutes per token at most.

## Rules (from the battalion's security officer — /kabam on the portal)
- **No classified information of any kind**, no operational or training plans, no real locations.
- **No personal ID numbers (מ.א.), ID cards, addresses, medical or mental-health info, grades.**
- Don't look like an official IDF system (no IDF emblem). **Never ask for an IDF username/password.**
- Never ask for a password at all — sign-in is only through צ1.
- Show the directory only to signed-in users, never publish it, never copy it to other services or logs.
- No analytics, trackers or third-party scripts that would see the users' data.

## Design
- `<html lang="he" dir="rtl">`, all text in Hebrew, works on a 360 px phone, tap targets ≥ 44 px.
- Escape user text (`textContent`, never raw `innerHTML` with names).
- The site may open inside the portal (in a frame) — don't use `target="_top"` tricks or frame-busting.

## Publishing
1. Deploy over **https** (GitHub Pages, Vercel, Netlify, Cloudflare Pages…).
2. In צ1: הוספת אפליקציה → אתר → the site's URL → tick **"האתר מתחבר עם צ1"** (and "רשימת אנשי הגדוד" if needed).
3. Until it's approved only the person who suggested it can sign in (to test it on the real URL).
4. The קב״מית approves it (and the directory, separately), then an admin adds it to the home page.
The registered URL is the site's identity: sign-in works on that URL and pages under it.
