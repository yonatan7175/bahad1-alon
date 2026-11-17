# דוגמאות

אפליקציות לדוגמה בריפו — העתיקו מהן:

| דוגמה | רמה | מה מדגימה | קבצים |
|---|---|---|---|
| **שלום עולם (פשוטה)** | `simple` | `user.me`, פתקים אישיים (`read: own`), לוח מחלקתי חי (`read: platoon` + `subscribe` + `moderate`), תזכורת `push` | `tests/fixtures/apps/hello-simple/` (דוגמה לבדיקות בלבד, לא מופיעה באתר) |
| **לו"ז מכונות כביסה** | `full` | אפליקציה אמיתית: שריון משבצות, זיהוי התנגשויות, תזכורת 10 דק' לפני | `apps/laundry/` + `src/app/a/laundry/page.tsx` |

## שלד מינימלי — אפליקציה פשוטה
```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>האפליקציה שלי</title>
  <link rel="stylesheet" href="/bahad.css" />
  <script src="/bahad.js"></script>
</head>
<body>
  <h1 id="hello">…</h1>
  <script>
    (async () => {
      await bahad.ready();
      const me = await bahad.user.me();
      document.getElementById("hello").textContent = "שלום, " + me.name;
    })().catch((e) => bahad.ui.toast("שגיאה: " + e.message));
  </script>
</body>
</html>
```

## שלד מינימלי — אפליקציה מלאה
```tsx
// apps/my-app/src/app.tsx
"use client";
import { useEffect, useState } from "react";
import { useBahad, type Me } from "@/platform/client";

export function MyApp() {
  const bahad = useBahad();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    bahad.user.me().then(setMe).catch((e) => bahad.ui.toast(e.message));
  }, [bahad]);
  return <main className="p-4">שלום, {me?.name ?? "…"}</main>;
}
```
```tsx
// src/app/a/my-app/page.tsx
import { AppPage } from "@/components/app-page";
import { MyApp } from "@apps/my-app/src/app";

export default function Page() {
  return <AppPage slug="my-app" tier="full"><MyApp /></AppPage>;
}
```
