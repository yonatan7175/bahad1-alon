"use client";
// The thin top bar around every app (plan 07 — App host): back, app name, ⋮ menu.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Bug, ExternalLink, Info, MoreVertical, X } from "lucide-react";
import type { ShellApi } from "@/platform/client";
import { useToast } from "./toast";
import { SCOPE_LABEL, reportUrl } from "@/lib/site";

export interface PublicApp {
  slug: string;
  url: string | null;
  iconUrl: string;
  name: string;
  description: string;
  authors: string[];
  version: string;
  tier: "simple" | "full" | "external";
  scopes: string[];
  status: string;
}

const ShellContext = createContext<ShellApi | null>(null);
export function useShell(): ShellApi {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside AppFrame");
  return s;
}

export function AppFrame({ app, children }: { app: PublicApp; children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(app.name);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const shell = useMemo<ShellApi>(
    () => ({ setTitle: (t) => setTitle(t || app.name), toast: (m) => toast(m), home: () => router.push("/") }),
    [app.name, router, toast],
  );
  const report = reportUrl(app.slug);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="fixed inset-0 z-20 flex flex-col bg-bg">
        <header className="glass border-b border-line/70 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2">
            <Link href="/" aria-label="חזרה לדף הבית" className="icon-btn">
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
            <img src={app.iconUrl} alt="" width={30} height={30} className="ms-1 size-[30px] rounded-[9px] shadow-[var(--shadow-sm)]" />
            <h1 className="ms-2 flex min-w-0 flex-1 items-center gap-2 text-base font-bold" data-testid="app-title">
              <span className="truncate">{title}</span>
              {app.status === "beta" ? <span className="badge-beta">בטא</span> : app.status === "hidden" ? <span className="badge-hidden">מוסתר</span> : null}
            </h1>
            <div className="relative" ref={menuRef}>
              <button type="button" aria-label="תפריט" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="icon-btn">
                <MoreVertical className="size-5" aria-hidden="true" />
              </button>
              {menu ? (
                <div role="menu" className="menu absolute end-0 top-12 w-56">
                  <button
                    role="menuitem"
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setMenu(false);
                      setAbout(true);
                    }}
                  >
                    <Info aria-hidden="true" /> על האפליקציה
                  </button>
                  {app.url ? (
                    <a role="menuitem" href={app.url} target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setMenu(false)}>
                      <ExternalLink aria-hidden="true" /> פתיחה בלשונית חדשה
                    </a>
                  ) : null}
                  {report ? (
                    <a role="menuitem" href={report} target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setMenu(false)}>
                      <Bug aria-hidden="true" /> דווח על בעיה
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
      {about ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          className="fixed inset-0 z-40 flex animate-fade items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center"
          onClick={() => setAbout(false)}
        >
          <div className="card w-full max-w-md animate-rise p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
              <img src={app.iconUrl} alt="" width={56} height={56} className="size-14 rounded-2xl shadow-[var(--shadow-sm)]" />
              <div className="min-w-0 flex-1">
                <h2 id="about-title" className="text-lg font-extrabold">
                  {app.name}
                </h2>
                <p className="mt-0.5 text-xs text-subtle" dir="ltr">
                  v{app.version} · {app.authors.join(", ")}
                </p>
              </div>
              <button type="button" className="icon-btn -me-2 -mt-2" onClick={() => setAbout(false)} aria-label="סגירה">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-[15px]">{app.description}</p>
            {app.url ? (
              <p className="mt-4 rounded-ctl bg-warning-soft p-3 text-sm text-fg">
                זהו <b>אתר חיצוני</b> (<span dir="ltr">{new URL(app.url).host}</span>) שמוצג בתוך הפורטל. הפורטל לא משתף איתו שום מידע עליך.
              </p>
            ) : null}
            <p className="section-title mt-5">מה האפליקציה מקבלת ממך</p>
            {app.scopes.length === 0 ? <p className="mt-2 text-sm text-muted">כלום.</p> : null}
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {app.scopes.map((sc) => (
                <li key={sc} className={sc === "contact" || sc === "push" ? "badge-warning" : "badge-accent"}>
                  {SCOPE_LABEL[sc] ?? sc}
                </li>
              ))}
            </ul>
            <button type="button" className="btn mt-6 w-full" onClick={() => setAbout(false)} autoFocus>
              הבנתי
            </button>
          </div>
        </div>
      ) : null}
    </ShellContext.Provider>
  );
}
