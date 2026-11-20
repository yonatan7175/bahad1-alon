"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, House, Lightbulb, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Avatar } from "./avatar";
import { ThemeToggle } from "./theme-toggle";

export interface MenuUser {
  name: string;
  avatarUrl: string | null;
  subtitle: string;
  canAdmin: boolean;
  pending?: number;
}

export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // close after navigating
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="תפריט משתמש"
        onClick={() => setOpen((o) => !o)}
        className="relative flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 ps-1 pe-2.5 shadow-[var(--shadow-sm)] transition-colors hover:bg-surface-2"
      >
        <Avatar name={user.name} url={user.avatarUrl} size={32} />
        <span className="hidden max-w-36 truncate text-sm font-semibold sm:inline">{user.name.split(" ")[0]}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {user.pending ? (
          <span className="absolute -top-1 -start-1 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white ring-2 ring-bg">
            {user.pending > 9 ? "9+" : user.pending}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="menu" className="menu absolute end-0 top-[calc(100%+8px)] w-72 origin-top-left">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar name={user.name} url={user.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="truncate font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.subtitle}</p>
            </div>
          </div>
          <div className="border-t border-line pt-1.5">
            <Link role="menuitem" href="/" className="menu-item">
              <House aria-hidden="true" /> דף הבית
            </Link>
            <Link role="menuitem" href="/profile" className="menu-item">
              <UserRound aria-hidden="true" /> הפרופיל שלי
            </Link>
            <Link role="menuitem" href="/people" className="menu-item">
              <UsersRound aria-hidden="true" /> אנשים
            </Link>
            {user.canAdmin ? (
              <Link role="menuitem" href="/admin" className="menu-item">
                <ShieldCheck aria-hidden="true" /> ניהול
                {user.pending ? <span className="badge-danger ms-auto">{user.pending} ממתינים</span> : null}
              </Link>
            ) : null}
            <Link role="menuitem" href="/feedback" className="menu-item">
              <Lightbulb aria-hidden="true" /> שינויים ושיפורים
            </Link>
          </div>
          <div className="mt-1.5 border-t border-line px-1.5 pb-1 pt-3">
            <p className="section-title mb-2 px-1">מראה</p>
            <ThemeToggle size="sm" />
          </div>
          <div className="mt-1.5 border-t border-line pt-1.5">
            <form action="/auth/signout" method="post">
              <button type="submit" role="menuitem" className="menu-item text-danger [&_svg]:text-danger">
                <LogOut aria-hidden="true" /> התנתקות
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
