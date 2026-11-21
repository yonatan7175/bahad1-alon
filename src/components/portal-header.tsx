import "server-only";
import Link from "next/link";
import { MonitorSmartphone } from "lucide-react";
import type { Session } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { commandersCanApprove } from "@/platform/server/config";
import { openFeedbackCount } from "@/platform/server/feedback";
import { pendingPositionCount } from "@/platform/server/positions";
import { ROLE_LABEL } from "@/lib/site";
import { Ribbon, Wordmark } from "./brand";
import { UserMenu } from "./user-menu";
import { MainNav, BottomNav } from "./main-nav";

/** Sticky glass header: brand (→ home), main navigation, user menu. On phones a bottom tab bar takes over the navigation. */
export async function PortalHeader({ session }: { session: Session }) {
  const p = session.profile;
  const canAdmin = p.role === "admin" || (p.role === "commander" && commandersCanApprove() && !!p.company_id);
  const db = await getDb();
  let pending = 0;
  if (canAdmin) {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profiles where status = 'pending' and onboarded_at is not null ${p.role === "admin" ? "" : "and company_id = $1"}`,
      p.role === "admin" ? [] : [p.company_id],
    );
    pending = rows[0]?.n ?? 0;
    if (p.role === "admin") pending += await pendingPositionCount(db); // requests for a position (תפקיד)
  }
  const feedback = p.role === "admin" ? await openFeedbackCount(db) : 0;
  const unit = [p.company_name, p.platoon_name].filter(Boolean).join(" · ");
  return (
    <>
      <header className="glass sticky top-0 z-30 border-b border-line/70 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="rounded-ctl" aria-label="צ1 — דף הבית">
            <Wordmark />
          </Link>
          <MainNav canAdmin={canAdmin} pending={pending} feedback={feedback} />
          <div className="flex items-center gap-1.5">
          <Link href="/install" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-bold text-accent-ink shadow-[var(--shadow-sm)] hover:bg-surface-2" aria-label="הוספה כאפליקציה">
            <MonitorSmartphone className="size-4" aria-hidden="true" />
            <span className="hidden min-[400px]:inline">הוספה כאפליקציה</span>
          </Link>
          <UserMenu
            user={{
              name: p.full_name ?? "",
              avatarUrl: p.avatar_url,
              subtitle: [ROLE_LABEL[p.role], unit].filter(Boolean).join(" · "),
              canAdmin,
              pending,
            }}
          />
          </div>
        </div>
        <Ribbon className="opacity-90" />
      </header>
      <BottomNav canAdmin={canAdmin} pending={pending} feedback={feedback} />
    </>
  );
}
