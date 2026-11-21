# מתכונים לחוקי נתונים

בוחרים תמיד את החוק **הצר ביותר** שעובד.

## רשימה אישית (רק אני רואה)
טודו, פתקים, מעקב אישי.
```json
"notes": { "read": "own", "create": "any" }
```

## לוח מחלקתי
כל המחלקה רואה וכותבת; מפקדים יכולים למחוק הודעות בפלוגה שלהם.
```json
"board": { "read": "platoon", "create": "any", "moderate": "commander" }
```

## הודעות מפקדים לפלוגה
רק מפקדים מפרסמים; כל הפלוגה קוראת.
```json
"announcements": { "read": "company", "create": "commander", "moderate": "commander" }
```

## דיווח שרק המפקד רואה (למשל ריכוז חוסרים)
כל חניך רואה רק את שלו; המפקד רואה את כל הפלוגה ויכול לסמן "טופל".
```json
"reports": { "read": "own", "create": "any", "moderate": "commander" }
```

## שריון משאב משותף (למשל מכונות כביסה)
כולם רואים מה תפוס; אף פעם לא שני אנשים על אותה משבצת; עד 2 בשבוע לכל אחד.
```json
"bookings": {
  "read": "all", "create": "any", "moderate": "commander",
  "unique": ["machine", "day", "time"],
  "quota": [{ "max": 2, "period": "week", "dateField": "day" }]
}
```
משבצת שאפשר לחלוק (עד 2 אנשים, או אחד שתופס את כולה) — `capacity` במקום `unique`:
```json
"capacity": { "keys": ["machine", "day", "time"], "max": 2, "sizeField": "seats" }
```
> השרת אוכף את החוקים (גם כששני אנשים לוחצים באותה שנייה). באפליקציה תפסו `conflict` ("המשבצת נתפסה") ו-`rate_limited` ("הגעת למכסה"). דוגמה מלאה: `apps/laundry/`.

## תוכן שרק המנהל מעדכן (למשל קישורים קבועים)
```json
"links": { "read": "all", "create": "admin", "moderate": "admin" }
```

## בדיקת מבנה (schema)
```json
"scores": {
  "read": "own", "create": "any",
  "schema": {
    "type": "object",
    "required": ["quiz", "score"],
    "properties": { "quiz": { "type": "string", "maxLength": 40 }, "score": { "type": "integer", "minimum": 0, "maximum": 100 } },
    "additionalProperties": false
  }
}
```
