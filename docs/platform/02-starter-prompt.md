# פרומפט התחלה

מעתיקים את הפרומפט המתאים (כפתור "העתקה"), מדביקים ב-ChatGPT / Claude / Gemini, ואז מתארים את הרעיון שלכם.
הפרומפט כבר כולל את כל החוקים, הסכמה של `app.json` ותיעוד ה-API — ה-AI לא צריך שום דבר נוסף.

## אפליקציה פשוטה (מומלץ להתחיל כאן)

````text
You are building a "simple app" for the Alon battalion portal (Hebrew, RTL, mobile-first).
Output a folder named after the app slug, containing: app.json, icon.svg, README.md, site/index.html (+ optional .js/.css files inside site/).
RULES:
- Load <script src="/bahad.js"></script> and <link rel="stylesheet" href="/bahad.css"> (absolute paths, exactly like this).
- Get the user ONLY via `await bahad.user.me()`. Store data ONLY via `bahad.data.collection(name)`.
- Always `await bahad.ready()` before the first call. Every API call is async and may throw { code, message }: show errors with bahad.ui.toast().
- NO external network requests, CDNs, fonts, analytics, or trackers. Bundle any library locally inside site/. External URLs are blocked by the portal anyway.
- NO localStorage/cookies for real data. NO eval / new Function. NO personal numbers (מ.א.), ID numbers, addresses, medical info, locations, or classified info.
- <html lang="he" dir="rtl">, works on a 360px-wide phone, tap targets ≥ 44px. All UI text in Hebrew. Escape any user text before putting it in innerHTML.
- app.json must follow this JSON Schema:
{{SCHEMA}}
- Allowed tags (1–3): {{TAGS}}
- Request only the scopes you need; explain any "contact" or "push" scope in README.md.
- Choose collection rules that expose data as narrowly as possible ("own" unless others must see it).
API reference:
{{API_REFERENCE}}
Test by opening site/index.html directly in a browser: bahad.js runs in mock mode with a fake user (add ?mockRole=commander to the URL to test as a commander). To test offline from a local file, copy bahad.js and bahad.css from the portal next to index.html and temporarily change the paths.
Now ask me what app I want to build.
````

## אפליקציה מלאה (Next.js)

````text
You are building a "full app" for the Alon battalion portal: a Next.js (App Router) + TypeScript + Tailwind CSS project, Hebrew RTL, mobile-first.
The portal repo is already set up. Run `pnpm install` and `pnpm dev` (mock login, no accounts needed).
Create ONLY these files:
- apps/<slug>/app.json, apps/<slug>/icon.svg, apps/<slug>/README.md
- apps/<slug>/src/** — React components and logic ("use client" components that use the Platform API)
- src/app/a/<slug>/page.tsx — exactly this thin route file and nothing else:
    import { AppPage } from "@/components/app-page";
    import { MyApp } from "@apps/<slug>/src/app";
    export default function Page() {
      return <AppPage slug="<slug>" tier="full"><MyApp /></AppPage>;
    }
RULES:
- In client components: `import { useBahad } from "@/platform/client"` (or `import { bahad } from "@/platform/client"`). Same methods as below.
- Optional server code: `import { platformFor } from "@/platform/server"` → `platformFor("<slug>")` (same rules; never use another slug).
- Never import from "@/platform/server/*" internals, never query the database, never read cookies, never call fetch() to other hosts.
- Use Tailwind logical classes (ms-*, me-*, ps-*, pe-*, start-*, end-*) and the theme colors: bg-surface, bg-surface-2, text-fg, text-muted, border-line, bg-accent, text-accent-contrast, text-danger. Buttons: className="btn" / "btn-secondary"; inputs: "field"; boxes: "card".
- NO external network requests, CDNs, fonts, analytics or trackers. NO personal numbers (מ.א.), ID numbers, addresses, medical info, locations, or classified info.
- All UI text in Hebrew; works on a 360px-wide phone; tap targets ≥ 44px.
- app.json must follow this JSON Schema (tier: "full"):
{{SCHEMA}}
- Allowed tags (1–3): {{TAGS}}
- Request only the scopes you need; explain any "contact" or "push" scope in README.md.
- Before submitting: `pnpm lint && pnpm typecheck && pnpm build` must pass.
API reference:
{{API_REFERENCE}}
Now ask me what app I want to build.
````
