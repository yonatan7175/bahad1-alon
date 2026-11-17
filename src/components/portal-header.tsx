import "server-only";
import Link from "next/link";
import type { Session } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { commandersCanApprove } from "@/platform/server/config";
import { ROLE_LABEL } from "@/lib/site";
import { Wordmark } from "./brand";
import { UserMenu } from "./user-menu";

/** Sticky glass header with the brand and the user menu (profile, admin, theme, sign out). */
export async function PortalHeader({ session }: { session: Session }) {
  const p = session.profile;
  const canAdmin = p.role === "admin" || (p.role === "commander" && commandersCanApprove() && !!p.company_id);
  let pending = 0;
  if (canAdmin) {
    const db = await getDb();
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profiles where status = 'pending' and onboarded_at is not null ${p.role === "admin" ? "" : "and company_id = $1"}`,
      p.role === "admin" ? [] : [p.company_id],
    );
    pending = rows[0]?.n ?? 0;
  }
  const unit = [p.company_name, p.platoon_name].filter(Boolean).join(" · ");
  return (
    <header className="glass sticky top-0 z-30 border-b border-line/70 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="rounded-ctl" aria-label="דף הבית">
          <Wordmark />
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
    </header>
  );
}
