"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Search, SearchX, Sparkles, X } from "lucide-react";
import { matchesQuery } from "@/lib/hebrew";
import { SchoolBadge } from "./brand";

export interface GridApp {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  iconUrl: string;
  status: "live" | "beta" | "hidden" | "disabled";
}

function greeting(h: number) {
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 21) return "ערב טוב";
  return "לילה טוב";
}

export function AppGrid({
  apps,
  tags,
  firstName,
  unit,
  initialTag,
}: {
  apps: GridApp[];
  tags: { name: string; count: number }[];
  firstName: string;
  unit: string;
  initialTag: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(initialTag && tags.some((t) => t.name === initialTag) ? initialTag : null);
  const [now, setNow] = useState<{ hello: string; date: string } | null>(null);

  // Greeting and date come from the phone's clock, so they are computed after hydration.
  useEffect(() => {
    const d = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device time is only known on the client
    setNow({
      hello: greeting(d.getHours()),
      date: new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(d),
    });
  }, []);

  const selectTag = (t: string | null) => {
    setTag(t);
    router.replace(t ? `${pathname}?tag=${encodeURIComponent(t)}` : pathname, { scroll: false });
  };

  const shown = useMemo(
    () => apps.filter((a) => (!tag || a.tags.includes(tag)) && matchesQuery([a.name, a.description, ...a.tags], query)),
    [apps, tag, query],
  );

  return (
    <section aria-labelledby="hello">
      {/* hero */}
      <div className="hero rounded-[28px] px-6 pb-16 pt-6 shadow-lift sm:px-10 sm:pb-20 sm:pt-9">
        <SchoolBadge className="mb-3 opacity-90" />
        <p className="text-sm font-medium opacity-80" suppressHydrationWarning>
          {now?.date ?? " "}
        </p>
        <h1 id="hello" className="mt-1 text-3xl font-extrabold sm:text-4xl" suppressHydrationWarning>
          {now?.hello ?? "שלום"}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-85">
          {unit ? <span>{unit}</span> : null}
          <span className="inline-flex items-center gap-1.5">
            <LayoutGrid className="size-4" aria-hidden="true" />
            {apps.length} אפליקציות זמינות
          </span>
        </p>
      </div>

      {/* search, overlapping the hero */}
      <div className="relative z-10 mx-3 -mt-8 sm:mx-8">
        <label htmlFor="app-search" className="sr-only">
          חיפוש אפליקציה
        </label>
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          id="app-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="חיפוש אפליקציה, למשל: כביסה"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 w-full rounded-2xl border border-line bg-surface ps-12 pe-12 text-base text-fg shadow-lift outline-none transition-shadow placeholder:text-subtle focus:shadow-[var(--ring),var(--shadow-lg)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="ניקוי החיפוש" className="icon-btn absolute end-1.5 top-1/2 size-10 -translate-y-1/2">
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* tag filter */}
      {tags.length > 0 ? (
        <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="סינון לפי תגית">
          <button type="button" className="chip" aria-pressed={tag === null} onClick={() => selectTag(null)}>
            הכל <span className="count">{apps.length}</span>
          </button>
          {tags.map((t) => (
            <button key={t.name} type="button" className="chip" aria-pressed={tag === t.name} onClick={() => selectTag(tag === t.name ? null : t.name)}>
              {t.name} <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* results */}
      {apps.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-subtle">
            <SearchX className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-3 font-semibold">לא נמצאו אפליקציות{query ? ` עבור "${query}"` : ""}</p>
          <button
            type="button"
            className="btn-ghost mt-2 text-accent"
            onClick={() => {
              setQuery("");
              selectTag(null);
            }}
          >
            ניקוי הסינון
          </button>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {shown.map((a, i) => (
            <li key={a.slug} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
              <AppCard app={a} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/dev"
        className="group mt-8 flex items-center gap-4 rounded-card border border-dashed border-line-strong bg-bg-elevated p-5 transition-colors hover:border-accent hover:bg-accent-soft/40"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Sparkles className="size-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">יש לך רעיון לאפליקציה?</span>
          <span className="block text-sm text-muted">עם פרומפט מוכן ל-AI אפשר לבנות אחת תוך ערב — בלי ניסיון בתכנות.</span>
        </span>
        <span className="hidden text-sm font-semibold text-accent group-hover:underline sm:block">לאתר המפתחים ←</span>
      </Link>
    </section>
  );
}

function AppCard({ app }: { app: GridApp }) {
  return (
    <Link
      href={`/a/${app.slug}`}
      className="group relative flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift active:scale-[0.98]"
    >
      <span className="flex items-start justify-between gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG/PNG icon from the app folder */}
        <img src={app.iconUrl} alt="" width={52} height={52} className="size-[52px] rounded-2xl shadow-[var(--shadow-sm)]" loading="lazy" />
        {app.status === "beta" ? <span className="badge-beta">בטא</span> : app.status === "hidden" ? <span className="badge-hidden">מוסתר</span> : null}
      </span>
      <span className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug">{app.name}</span>
      <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{app.description}</span>
      <span className="mt-auto flex flex-wrap gap-1 pt-3">
        {app.tags.map((t) => (
          <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
            {t}
          </span>
        ))}
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card mt-8 flex flex-col items-center py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <LayoutGrid className="size-7" aria-hidden="true" />
      </span>
      <p className="mt-3 text-lg font-bold">עדיין אין כאן אפליקציות</p>
      <p className="mt-1 max-w-xs text-muted">רוצים לבנות את הראשונה? כל ההסברים נמצאים באתר המפתחים.</p>
    </div>
  );
}
