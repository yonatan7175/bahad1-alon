// The Claude Code starter prompt for a website that signs in with צ1 (shown on "הוספת אפליקציה").
// Keep in sync with templates/connected-site/CLAUDE.md (same rules, same API).

/** Where the starter template lives (public repo). */
export const TEMPLATE_URL = "https://github.com/yonatan7175/bahad1-alon/tree/main/templates/connected-site";

export function connectPrompt(portal: string): string {
  return `You are helping me build a small website for the Alon battalion (גדוד אלון, בה״ד 1).
Users sign in with their "צ1" account — the battalion portal at ${portal}. The site has NO login, signup or passwords of its own.

## Sign-in and user data — use the portal's SDK, don't reimplement OAuth
Load ${portal}/connect.js (a plain <script>, before your own code). It exposes window.bahadConnect:
- await bahadConnect.requireUser() → the signed-in user (redirects once to צ1 if needed, then back to the same page)
  { id, name, avatarUrl, role: "cadet"|"commander"|"admin", company, companyId, platoon, room,
    positions: string[], phone: string|null, email: string|null, scopes: ["profile"] | ["profile","directory"] }
- await bahadConnect.ready() → the user or null, never redirects.  await bahadConnect.signOut().
- await bahadConnect.people() → the battalion directory, ONLY if user.scopes includes "directory"
  (the battalion's security officer — הקב״מית — must approve it per site). Each person:
  { id, name, avatarUrl, role, company, platoon, positions, phone|null, email|null }
- bahadConnect.token() → the access token, to send to MY OWN server only.
- Errors are Error objects with .code: "unauthorized", "insufficient_scope", "denied", "rate_limited".
- On localhost / 127.0.0.1 / file:// the SDK runs in MOCK mode: a fake user and fake people, no network.
  Test roles with ?mockRole=commander or ?mockRole=admin, and no directory with ?mockNoDirectory.

## Data
The portal does NOT store this site's data. Prefer a site that needs no server. If it must save shared data,
use its own backend (e.g. a free Supabase/Firebase project or a small serverless function), and then:
- the browser sends bahadConnect.token() as "Authorization: Bearer <token>" to MY server;
- MY server calls GET ${portal}/api/connect/userinfo with that same header and uses the "id" it returns.
  NEVER trust a user id, name or role sent from the browser. Cache that answer per token for a few minutes at most.

## Security rules (from the קב״מית — mandatory)
- No classified information of any level, no operational/training plans, no real unit locations or coordinates.
- No personal ID numbers (מ.א.), ID cards, addresses, medical or mental-health information, grades or evaluations.
- Must not look like an official IDF system (no IDF emblem). Never ask for an IDF username or password — never ask for any password.
- The directory is for signed-in users only: never publish it, export it, log it, or send it to any other service.
- No analytics, trackers, ads or third-party scripts that could see users' data.

## Design
- <html lang="he" dir="rtl">, all UI text in Hebrew, mobile-first: works on a 360 px wide phone, tap targets ≥ 44 px, light + dark mode.
- Put user-provided text on the page with textContent (never raw innerHTML with names or user input).
- The site may be shown inside the portal (in a frame): no frame-busting, no target="_top".

## Deliverable
- A static site (index.html + small JS/CSS files) unless I ask for more, plus a README.md in Hebrew explaining how to run it.
- Let me test locally with: npx serve .   (mock mode)
- Then help me publish it over https (GitHub Pages is the easiest: repo → Settings → Pages), and remind me to
  suggest it in צ1: "הוספת אפליקציה" → אתר → its URL → tick "האתר מתחבר עם צ1" (and "רשימת אנשי הגדוד" if needed).
  Until it's approved only I can sign in to it, on its real URL. Then the קב״מית and a site admin approve it.

Starter template for reference: ${TEMPLATE_URL}

Now ask me what the site should do, then build it step by step.`;
}
