"use client";
// Main navigation. Desktop: inline links in the header. Phone: a bottom tab bar (thumb reach).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, House, Lightbulb, ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react";

interface NavProps {
  canAdmin: boolean;
  pending: number;
  feedback: number;
}
interface Item {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  badge?: number;
}

function items({ canAdmin, pending, feedback }: NavProps): Item[] {
  const list: Item[] = [
    { href: "/", label: "דף הבית", short: "בית", icon: House },
    { href: "/people", label: "אנשים", short: "אנשים", icon: UsersRound },
    { href: "/feedback", label: "שינויים ושיפורים", short: "שיפורים", icon: Lightbulb, badge: feedback },
    { href: "/develop", label: "פיתוח", short: "פיתוח", icon: Code2 },
  ];
  if (canAdmin) list.push({ href: "/admin", label: "ניהול", short: "ניהול", icon: ShieldCheck, badge: pending });
  else list.push({ href: "/profile", label: "הפרופיל שלי", short: "פרופיל", icon: UserRound });
  return list;
}

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export function MainNav(props: NavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט ראשי" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
      {items(props).map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition-colors ${
              active ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <it.icon className="size-4" aria-hidden="true" />
            {it.label}
            {it.badge ? <span className="badge-danger px-1.5 text-[10px]">{it.badge > 9 ? "9+" : it.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav(props: NavProps) {
  const pathname = usePathname();
  const list = items(props);
  return (
    <nav
      aria-label="ניווט ראשי"
      className="bottom-nav glass fixed inset-x-0 bottom-0 z-30 border-t border-line/70 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${
                  active ? "text-accent-ink" : "text-muted"
                }`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                  <it.icon className="size-[20px]" aria-hidden="true" />
                </span>
                {it.short}
                {it.badge ? (
                  <span className="absolute top-1.5 start-[calc(50%+6px)] flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-bg">
                    {it.badge > 9 ? "9+" : it.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
