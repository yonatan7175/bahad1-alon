# תבנית: אתר שמתחבר עם צ1

אתר קטן שהמשתמשים נכנסים אליו עם החשבון שלהם בצ1 — בלי הרשמה נפרדת.

## איך מתחילים (עם Claude Code)
1. מעתיקים את התיקייה הזאת לתיקייה חדשה (או ריפו חדש ב-GitHub).
2. פותחים בה את Claude Code ומתארים את הרעיון: *"תבנה לי אתר ש..."*. הוא יקרא את `CLAUDE.md` ויעבוד לפי הכללים.
3. מריצים מקומית: `npx serve .` ופותחים `http://localhost:3000` — מצב דמו עם משתמש לדוגמה ורשימת אנשים מזויפת.
4. מעלים לאוויר ב-https (למשל GitHub Pages: Settings → Pages).
5. בצ1: **הוספת אפליקציה → אתר** → הכתובת → מסמנים **"האתר מתחבר עם צ1"**.
6. עד האישור — רק מי שהציע/ה יכול/ה להתחבר (לבדיקה). אחרי אישור הקב״מית ומנהל האתר — כולם.

## מה האתר מקבל
- **תמיד:** המשתמש המחובר — שם, תמונה, תפקיד, פלוגה, צוות, חדר, תפקידים (ואת הטלפון/אימייל רק אם בחר להציג).
- **באישור קב״מית בלבד:** רשימת אנשי הגדוד (כמו בדף "אנשים").
- **אף פעם:** הרשאה לשנות משהו בצ1. הנתונים של האתר נשמרים אצלו.

## לשרת של האתר (אם יש)
```js
// Node / edge function: who is calling?
const r = await fetch("https://bahad1-alon.duckdns.org/api/connect/userinfo", {
  headers: { authorization: req.headers.authorization }, // the token from bahadConnect.token()
});
if (!r.ok) return new Response("unauthorized", { status: 401 });
const user = await r.json(); // { id, name, role, company, ... } — use user.id as the key for your data
```
