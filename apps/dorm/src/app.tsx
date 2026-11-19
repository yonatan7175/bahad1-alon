"use client";
// מגורים — living-quarters logistics for גדוד אלון.
// Tabs: החדר שלי (daily confirmation + 2-tap report) · מפה (live floor map) · ניהול (logistics officer).
import { useEffect, useState } from "react";
import { House, LayoutDashboard, Map as MapIcon } from "lucide-react";
import { useBahad } from "@/platform/client";
import { FLOORS, ROOMS, areaById, type Area, type Floor } from "./building";
import { itemById } from "./items";
import { useDorm } from "./data";
import { FloorMap, Legend } from "./map";
import { ManagerDashboard } from "./manager";
import { QuickReport, RoomDetails, DailyConfirm } from "./room-panel";
import { Sheet } from "./sheet";

type Tab = "room" | "map" | "manage";

export function DormApp() {
  const bahad = useBahad();
  const d = useDorm();
  const myRoom = d.me?.room && areaById(d.me.room)?.kind === "room" ? d.me.room : null;
  const [tab, setTab] = useState<Tab | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [sheet, setSheet] = useState<Area | null>(null);

  // Default tab/floor once we know who this is.
  const current: Tab = tab ?? (d.isManager ? "manage" : myRoom ? "room" : "map");
  const currentFloor: Floor = floor ?? (myRoom ? (Number(myRoom[0]) as Floor) : 2);

  useEffect(() => {
    bahad.ui.setTitle(current === "room" ? (myRoom ? `מגורים · חדר ${myRoom}` : "מגורים") : current === "map" ? `מגורים · קומה ${currentFloor}` : 'מגורים · לוח קל"ג');
  }, [bahad, current, myRoom, currentFloor]);

  const tabs = [
    ["room", "החדר שלי", House],
    ["map", "מפה", MapIcon],
    ...(d.isManager ? ([["manage", 'קל"ג', LayoutDashboard]] as const) : []),
  ] as const;

  const floorOpen = (f: Floor) => (d.open ?? []).filter((t) => areaById(t.data.room)?.floor === f);
  const floorChecked = (f: Floor) => ROOMS.filter((r) => r.floor === f && d.checkByRoom.has(r.id)).length;
  const openRoom = (room: string) => {
    const a = areaById(room);
    if (a) setSheet(a);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-4">
      <nav className="sticky top-0 z-30 -mx-4 flex h-[64px] items-start bg-bg/90 px-4 pt-1 backdrop-blur" aria-label="לשוניות">
        <div className={`grid w-full gap-1 rounded-card bg-surface-2 p-1 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              aria-current={current === k ? "page" : undefined}
              onClick={() => setTab(k)}
              className={`relative flex min-h-11 items-center justify-center gap-2 rounded-ctl text-sm font-bold transition-all ${
                current === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
              }`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
              {k === "room" && myRoom && !d.checkByRoom.has(myRoom) ? (
                <span className="absolute end-2 top-2 size-2 rounded-full bg-gold" aria-label="עוד לא אישרתם היום" />
              ) : null}
              {k === "manage" && (d.open?.length ?? 0) > 0 ? <span className="badge-danger text-[10px]">{d.open?.length}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      {d.open === null ? (
        <div className="space-y-3" aria-busy="true" aria-label="טוען">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : current === "room" ? (
        myRoom ? (
          <div className="space-y-5 animate-rise">
            <header className="relative overflow-hidden rounded-card bg-[image:var(--hero)] p-5 text-[color:var(--hero-text)] shadow-[var(--shadow-lg)]">
              <p className="text-sm font-semibold opacity-80">החדר שלי · קומה {myRoom[0]}</p>
              <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">{myRoom}</p>
              <p className="mt-2 text-sm opacity-90">
                {(d.openByRoom.get(myRoom) ?? []).length
                  ? `פתוח: ${(d.openByRoom.get(myRoom) ?? []).map((t) => itemById(t.data.item)?.emoji).join(" ")}`
                  : "אין פניות פתוחות"}
              </p>
              <a href="/profile" className="absolute end-4 top-4 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur hover:bg-white/25">
                עברתי חדר
              </a>
              <span className="pointer-events-none absolute -bottom-6 -start-4 text-[120px] leading-none opacity-10" aria-hidden="true">
                🏠
              </span>
            </header>
            <DailyConfirm d={d} room={myRoom} isMine />
            <section className="card p-4">
              <h2 className="text-lg font-extrabold">מה חסר? דיווח בשתי לחיצות</h2>
              <p className="mb-3 text-xs text-muted">כבר דיווחו מהחדר? תראו את זה כאן ותוכלו לסמן +1 במקום לפתוח פנייה כפולה.</p>
              <QuickReport d={d} room={myRoom} />
            </section>
            <section>
              <RoomDetails d={d} room={myRoom} isMine hideConfirm />
            </section>
          </div>
        ) : (
          <div className="card mt-4 p-6 text-center animate-rise">
            <p className="text-4xl" aria-hidden="true">
              🚪
            </p>
            <h2 className="mt-2 text-xl font-extrabold">באיזה חדר את/ה?</h2>
            <p className="mt-1 text-sm text-muted">
              {d.me?.room ? `החדר "${d.me.room}" לא נמצא במגורים (קומות 2–4, חדרים 37–56).` : "עוד לא הוגדר חדר בפרופיל."} עדכנו בפרופיל וחזרו לכאן.
            </p>
            <a href="/profile" className="btn mt-4 min-h-12">
              עדכון החדר בפרופיל
            </a>
            <button type="button" className="btn-ghost mt-2 min-h-11 w-full" onClick={() => setTab("map")}>
              או לדווח מהמפה
            </button>
          </div>
        )
      ) : current === "map" ? (
        <div className="space-y-3 animate-rise">
          <div className="grid grid-cols-3 gap-1 rounded-card bg-surface-2 p-1" role="group" aria-label="בחירת קומה">
            {FLOORS.map((f) => {
              const n = floorOpen(f).length;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={currentFloor === f}
                  onClick={() => setFloor(f)}
                  className={`relative min-h-11 rounded-ctl text-sm font-bold transition-all ${currentFloor === f ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted"}`}
                >
                  קומה {f}
                  {myRoom?.[0] === String(f) ? <span className="ms-1 text-accent" aria-label="(הקומה שלך)">●</span> : null}
                  {n ? <span className="absolute end-1.5 top-1 text-[10px] font-extrabold text-danger">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
            <span className="font-semibold">
              {floorOpen(currentFloor).length} פניות פתוחות · {floorChecked(currentFloor)}/20 חדרים אישרו היום
            </span>
            <span className="text-xs text-muted">לחצו על חדר לפרטים ודיווח</span>
          </div>
          <FloorMap d={d} floor={currentFloor} myRoom={myRoom} onOpen={setSheet} />
          <Legend />
        </div>
      ) : (
        <div className="animate-rise">
          <ManagerDashboard d={d} onOpenRoom={openRoom} />
        </div>
      )}

      <Sheet open={!!sheet} title={sheet?.label ?? ""} onClose={() => setSheet(null)}>
        {sheet ? <RoomDetails d={d} room={sheet.id} isMine={sheet.id === myRoom} /> : null}
      </Sheet>
    </main>
  );
}
