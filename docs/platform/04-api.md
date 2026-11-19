# ה-API

**API אחד, שתי דרכים לטעון אותו:**
- **אפליקציה פשוטה:** `<script src="/bahad.js"></script>` → אובייקט גלובלי `bahad`.
- **אפליקציה מלאה:** `import { bahad, useBahad } from "@/platform/client"` בקומפוננטות לקוח, ו-`import { platformFor } from "@/platform/server"` בקוד שרת.

כל הפונקציות אסינכרוניות (`async`). כל שגיאה היא `BahadError { code, message }`, כאשר `code` הוא אחד מ:
`unauthorized`, `forbidden`, `not_found`, `invalid`, `rate_limited`, `app_disabled`, `conflict` (נתפס ע"י מישהו אחר — `unique`).

## עיון מהיר
```js
await bahad.ready();                    // מחובר לפורטל (או מצב פיתוח)
bahad.isMock;                           // true כשרצים מחוץ לפורטל (משתמש מדומה)

// ── משתמש ─────────────────────────────────────────
const me = await bahad.user.me();
// { id, name, avatarUrl,
//   role?, manager?,    // scope "role" (manager: מנהל האתר או מנהל של האפליקציה הזו)
//   company?, platoon?, // { id, name } | null — scope "unit"
//   room?,              // מספר החדר מההרשמה | null — scope "unit"
//   email?, phone? }    // scope "contact"

// ── נתונים (לכל אפליקציה ולכל אוסף; החוקים מ-app.json) ──
const bookings = bahad.data.collection("bookings");
const rec  = await bookings.add({ machine: 2, start: "2026-11-20T18:00:00+02:00" });
const list = await bookings.list({ where: { machine: 2 }, order: "createdAt:desc", limit: 50 });
const myOwn = await bookings.list({ mine: true });   // רק הרשומות שלי
const one  = await bookings.get(rec.id);
await bookings.update(rec.id, { machine: 3 });   // מיזוג רדוד לתוך data
await bookings.remove(rec.id);
const stop = bookings.subscribe(() => reload());  // נקרא כשהאוסף משתנה; stop() מפסיק
// Record = { id, data, owner: { id, name }, mine: boolean, createdAt, updatedAt }

// ── התראות (scope "push") ──────────────────────────
const n = await bahad.push.notify({ to: "me", title: "המכונה מתפנה", body: "בעוד 10 דק'", at: "2026-11-20T17:50:00+02:00" });
await bahad.push.cancel(n.id);                                   // ביטול התראה מתוזמנת שעוד לא נשלחה
await bahad.push.notify({ to: { platoon: "<id>" }, title, body }); // מפקדים/מנהלים בלבד
const off = bahad.push.onReceive((m) => console.log(m.title));    // התראה שהגיעה בזמן שהאפליקציה פתוחה

// ── ממשק ───────────────────────────────────────────
bahad.ui.setTitle("מכונה 2");           // הכותרת בסרגל העליון
bahad.ui.toast("נשמר ✔");               // הודעה קצרה
bahad.ui.home();                        // חזרה לדף הבית של הפורטל
```

## פרטים חשובים
- **`list`:** `where` = שוויון על מפתחות ברמה העליונה בלבד (ערכים: מחרוזת/מספר/בוליאני/null, עד {{WHERE_KEYS}} מפתחות). `order` = `createdAt` או `updatedAt`, `:asc`/`:desc`. `limit` ברירת מחדל {{LIST_DEFAULT}}, מקסימום {{LIST_MAX}}.
- **`get`/`update`/`remove`** על רשומה שאין לכם גישה אליה מחזירים `not_found` (או `forbidden` אם מותר לראות ולא לשנות).
- **`subscribe`:** האות לא מכיל נתונים — קוראים שוב ל-`list()`. האות מגיע גם אחרי חזרה לאפליקציה (מסך כבוי וכו').
- **`push.notify`:** `to` = `"me"`, `{ platoon: id }` או `{ company: id }` (מפקד — רק בפלוגה שלו; מנהל — בכל מקום). `at` עם אזור זמן (למשל `+02:00` או `Z`), עד {{PUSH_DAYS}} יום קדימה. `url` (לא חובה) = נתיב בתוך האפליקציה, `/a/<slug>…`. כותרת עד {{PUSH_TITLE}} תווים, גוף עד {{PUSH_BODY}}. מחזיר `{ id, recipients }`.
- התראות מגיעות רק למי שהפעיל התראות בפרופיל (בדפדפני אנדרואיד ומחשב). **באייפון התראות מאתר לא מגיעות** — אל תסתמכו עליהן כערוץ היחיד.

## מגבלות
| מגבלה | ערך |
|---|---|
| גודל רשומה | {{RECORD_KB}} KB (JSON) |
| כתיבות (add/update/remove) | {{WRITES_PER_MIN}} בדקה, למשתמש, לאפליקציה |
| רשומות למשתמש באוסף | {{MAX_PER_USER}} (או `maxPerUser`) |
| התראות | {{PUSH_PER_DAY}} קריאות `notify` ביום, למשתמש, לאפליקציה |

## מצב פיתוח (mock)
כש-`bahad.js` רץ **מחוץ לפורטל** (קובץ מקומי, או `window.parent === window`) הוא עובר למצב פיתוח: משתמש מדומה, נתונים ב-localStorage, ותג "מצב פיתוח" בפינה. אפשר לבדוק כמפקד עם `?mockRole=commander` בכתובת. במצב פיתוח לא נאכפים חוקי הגישה — בודקים אותם בפורטל עצמו.

## טיפוסים (TypeScript)
```ts
{{API_TYPES}}
```
