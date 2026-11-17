# app.json — כרטיס האפליקציה

לכל אפליקציה יש קובץ `apps/<slug>/app.json`. ממנו נבנים דף הבית, ההרשאות וחוקי הנתונים. שגיאה בקובץ = הבנייה נכשלת (עם הודעה שמסבירה מה לתקן).

## דוגמה
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
    "bookings": { "read": "company", "create": "any", "moderate": "commander", "maxPerUser": 3 }
  },
  "version": "1.0.0"
}
```

## שדות
| שדה | חובה | חוקים |
|---|---|---|
| `slug` | ✔ | `a-z0-9-`, 3–32 תווים, ייחודי, **זהה לשם התיקייה**, לא משתנה אחרי העלייה |
| `name` | ✔ | שם תצוגה בעברית, עד 30 תווים |
| `description` | ✔ | עד 120 תווים |
| `tier` | ✔ | `simple` או `full` (יש גם `external` — אתר חיצוני שמוצג בתוך הפורטל עם `url`; רק באישור המנהל, בלי גישה ל-API) |
| `icon` | ✔ | קובץ SVG (או PNG בגודל 192px לפחות) בתוך תיקיית האפליקציה |
| `tags` | ✔ | 1–3 תגיות מהרשימה המותרת (למטה) |
| `authors` | ✔ | שמות משתמש ב-GitHub (הם יתבקשו לאשר שינויים באפליקציה) |
| `status` | ✔ | `live`, `beta` (מוצג תג "בטא") או `hidden` (רק מנהלים רואים) |
| `audience` | – | אילו תפקידים רואים את האפליקציה. ברירת מחדל: כולם |
| `scopes` | – | מתוך `profile`, `role`, `unit`, `contact`, `data`, `push`. `profile` תמיד כלול; `data` נכלל אוטומטית כשיש `collections` |
| `collections` | – | חוקי נתונים לכל אוסף (ראו למטה) |
| `version` | ✔ | semver (למשל `1.2.0`), להעלות בכל שינוי |

## תגיות מותרות
{{TAGS}}

תגית חדשה? מבקשים מהמנהל — הוא מוסיף אותה ב-PR נפרד.

## הרשאות (scopes)
| scope | מה מקבלים ב-`user.me()` | הערות |
|---|---|---|
| `profile` | `id`, `name`, `avatarUrl` | תמיד |
| `role` | `role` | |
| `unit` | `company`, `platoon` (`{ id, name }` או `null`) | |
| `contact` ⚠️ | `email`, `phone` | **רגיש** — חייבים להסביר ב-README למה; המנהל מאשר ידנית. המשתמשים רואים בפרופיל אילו אפליקציות מקבלות את זה |
| `data` | גישה ל-`bahad.data` | נכלל אוטומטית כשיש `collections` |
| `push` ⚠️ | גישה ל-`bahad.push` | **רגיש** — להסביר ב-README |

## חוקי אוסף (`collections`)
| מפתח | ערכים | משמעות |
|---|---|---|
| `read` | `own` / `platoon` / `company` / `all` | אילו רשומות משתמש רגיל רואה (חוץ משלו), לפי היחידה **הנוכחית** של בעל הרשומה |
| `create` | `any` / `commander` / `admin` | מי יכול להוסיף (`commander` = מפקדים ומנהלים) |
| `moderate` | `none` / `commander` / `admin` | מי רואה **הכל** ויכול לערוך/למחוק **כל** רשומה. מפקד — רק בפלוגה שלו. ברירת מחדל: `admin` |
| `maxPerUser` | מספר | תקרת רשומות למשתמש (התקרה הכללית: {{MAX_PER_USER}}) |
| `schema` | JSON Schema | לא חובה. השרת בודק כל כתיבה מול הסכמה |
| `unique` | רשימת מפתחות | לא חובה. אין שתי רשומות עם אותם ערכים במפתחות האלה (למשל `["machine","day","time"]` = משבצת). נאכף אטומית; התנגשות מחזירה `conflict` |
| `quota` | רשימת חוקים | לא חובה. מגבלה לכל משתמש ליום/שבוע לפי תאריך שבתוך הרשומה: `{ "max": 2, "period": "week", "dateField": "day", "match": { "kind": "washer" } }`. שבוע = א'–ש'. חריגה מחזירה `rate_limited` |

כל משתמש יכול תמיד לערוך ולמחוק את **הרשומות של עצמו**.

## הסכמה המלאה (JSON Schema)
```json
{{SCHEMA}}
```
