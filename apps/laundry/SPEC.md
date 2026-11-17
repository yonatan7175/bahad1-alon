# לו"ז מכונות כביסה v2 — spec (draft, waiting for owner decisions)

## Goals
Booking a washer or dryer must take **under 10 seconds**, look like a calendar, and be fair (weekly limit).

## Model
- **Machines** are a separate list per company: name + type (`washer` / `dryer`), active on/off. **Commanders/admins edit it inside the app** (no code change when a machine breaks).
- **Slots**: 30 minutes, 06:00–24:00, Israel time. The week is Sunday–Saturday.
- **Booking** = machine + day + start slot + length (1–N consecutive slots). Washer and dryer bookings are separate.
- **Weekly limit**: 2 per week per person (exact counting rule: decision 1).
- Commanders/admins can free any booking in their company (`moderate: commander`).
- Reminder push 10 minutes before (when notifications are on); cancelling a booking cancels the reminder.

## Screens
1. **יומן (calendar)** — main view. Day strip (7 days, swipe) + a time grid: rows = 30-min slots, columns = machines (washers first, then dryers, with a filter chip "כביסה / מייבש / הכל"). Free = empty cell; mine = filled accent; taken = grey with first name. Tap a free cell → bottom sheet: machine, time, length (30 / 60 / 90 min), "שריון". A "now" line on today. Past slots disabled.
2. **ההשתבצויות שלי** — upcoming bookings as cards (machine, day, time, countdown "בעוד 2 שעות"), quota meter "1 / 2 השבוע — כביסה", cancel / move. Past week history collapsed.
3. **חיפוש סלוט פנוי** — quick finder: type (washer / dryer / either), when (today / tomorrow / this week / a specific day), time of day (בוקר / צהריים / ערב / לילה / any), length → a list of the next free options ("היום 19:30 · כביסה 2"), sorted by soonest. One tap books it. Also an "הבא בתור" button = earliest free slot now.

## Rules enforced
- No double booking: earliest-created booking wins (all clients compute the same), and the loser is told immediately.
- Weekly limit is checked before booking; when reached → explain when it resets ("מתאפס ביום א'").
- Can't book in the past; max 7 days ahead.

## Platform work this needs
- Atomic slot locking in the API (a generic "unique key" option on a collection), so two people can't hold the same slot even for a second. Plus a "max N per user per period" rule enforced on the server, not only in the app.
- The machines list as a second collection (`create/moderate: commander`, `read: company`).
