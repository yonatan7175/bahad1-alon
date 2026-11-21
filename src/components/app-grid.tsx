"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck, ExternalLink, LayoutGrid, Lightbulb, PlusCircle, Search, SearchX, X } from "lucide-react";
import { matchesQuery } from "@/lib/hebrew";
import { Ribbon, SchoolBadge } from "./brand";

export interface GridApp {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  iconUrl: string;
  status: "live" | "hidden" | "disabled";
  /**
   * An admin-approved outside website ("הוספת אפליקציה"), no Platform API. `inside` is its in-portal
   * page (/l/<id>/<host>) when the site can be framed; otherwise the tile opens it in a new tab.
   */
  link?: { url: string; emoji: string; image?: string | null; inside?: string | null };
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
      <div className="hero rounded-[28px] shadow-lift">
        <div className="px-6 pb-16 pt-6 sm:px-10 sm:pb-20 sm:pt-9">
          <SchoolBadge className="mb-3" />
          <p className="text-sm font-medium opacity-80" suppressHydrationWarning>
            {now?.date ?? "\u00a0"}
          </p>
          <h1 id="hello" className="mt-1 text-3xl font-extrabold sm:text-4xl" suppressHydrationWarning>
            {now?.hello ?? "שלום"}
            {firstName ? <span className="hero-gold">, {firstName}</span> : ""}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-85">
            {unit ? <span>{unit}</span> : null}
            <span className="inline-flex items-center gap-1.5">
              <LayoutGrid className="size-4" aria-hidden="true" />
              {apps.length} אפליקציות
            </span>
          </p>
        </div>
        <Ribbon />
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
        <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
          {shown.map((a, i) => (
            <li key={a.slug} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
              <AppCard app={a} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/roles" className="group flex items-center gap-4 rounded-card border border-dashed border-line-strong bg-bg-elevated p-4 transition-colors hover:border-accent hover:bg-accent-soft/40" data-testid="roles-link">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <BadgeCheck className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">יש לך תפקיד?</span>
            <span className="block text-sm text-muted">בקשה לתפקיד — אחרי אישור מנהל הוא יופיע ליד השם שלך.</span>
          </span>
        </Link>
        <Link href="/a/add-app" className="group flex items-center gap-4 rounded-card border border-dashed border-line-strong bg-bg-elevated p-4 transition-colors hover:border-accent hover:bg-accent-soft/40">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <PlusCircle className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">מכירים כלי שחסר כאן?</span>
            <span className="block text-sm text-muted">הציעו אתר או אפליקציה — אחרי אישור הוא יופיע לכולם.</span>
          </span>
        </Link>
        <Link href="/feedback" className="group flex items-center gap-4 rounded-card border border-dashed border-line-strong bg-bg-elevated p-4 transition-colors hover:border-gold hover:bg-gold-soft/50">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold">
            <Lightbulb className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">משהו לא עובד? יש רעיון?</span>
            <span className="block text-sm text-muted">שינויים ושיפורים — ישירות למנהל האתר.</span>
          </span>
        </Link>
      </div>
    </section>
  );
}

const CARD =
  "group relative flex h-full flex-col items-center rounded-card border border-line bg-surface px-2 pb-4 pt-5 text-center shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift active:scale-[0.97]";
const ICON = "size-16 rounded-[22px] shadow-[var(--shadow)] ring-1 ring-black/5";

function LinkIcon({ link }: { link: NonNullable<GridApp["link"]> }) {
  return link.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded icon (data URL, validated on the server)
    <img src={link.image} alt="" width={64} height={64} className={`${ICON} object-cover`} loading="lazy" />
  ) : (
    <span className={`${ICON} flex items-center justify-center bg-surface-2 text-[32px]`} aria-hidden="true">
      {link.emoji}
    </span>
  );
}

function AppCard({ app }: { app: GridApp }) {
  if (app.link?.inside) {
    // Opens inside the portal, exactly like a built-in app. A plain <a> (full page load), NOT <Link>:
    // the page's CSP frame-src for this site comes from the proxy on a real request, and a client-side
    // navigation keeps the previous page's CSP (frame-src 'self'), so the frame would stay blank.
    return (
      <a href={app.link.inside} className={CARD}>
        <LinkIcon link={app.link} />
        <span className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug">{app.name}</span>
      </a>
    );
  }
  if (app.link) {
    return (
      <a href={app.link.url} target="_blank" rel="noopener noreferrer" className={CARD} aria-label={`${app.name} (נפתח בלשונית חדשה)`}>
        <ExternalLink className="absolute end-2.5 top-2.5 size-3.5 text-subtle" aria-hidden="true" />
        <LinkIcon link={app.link} />
        <span className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug">{app.name}</span>
      </a>
    );
  }
  return (
    <Link href={`/a/${app.slug}`} className={CARD}>
      {app.status === "hidden" ? <span className="badge-hidden absolute end-2 top-2">מוסתר</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG/PNG icon from the app folder */}
      <img src={app.iconUrl} alt="" width={64} height={64} className={ICON} loading="lazy" />
      <span className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug">{app.name}</span>
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
      <p className="mt-1 max-w-xs text-muted">אפשר להציע את הראשונה דרך &quot;הוספת אפליקציה&quot;.</p>
    </div>
  );
}
