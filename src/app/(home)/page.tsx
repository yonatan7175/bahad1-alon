import Link from "next/link";
import { ChevronLeft, UserRoundCheck } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { allTags, loadOverrides, visibleApps } from "@/platform/server/registry";
import { commandersCanApprove } from "@/platform/server/config";
import { PortalHeader } from "@/components/portal-header";
import { AppGrid, type GridApp } from "@/components/app-grid";

export default async function Home(props: PageProps<"/">) {
  const session = await requireApproved("/");
  const { profile } = session;
  const { tag } = await props.searchParams;
  const db = await getDb();
  const apps: GridApp[] = visibleApps(profile.role, await loadOverrides(db)).map(({ app, status }) => ({
    slug: app.slug,
    name: app.name,
    description: app.description,
    tags: app.tags,
    iconUrl: app.iconUrl,
    status,
  }));
  const tags = allTags()
    .map((t) => ({ name: t, count: apps.filter((a) => a.tags.includes(t)).length }))
    .filter((t) => t.count > 0);

  const canApprove = profile.role === "admin" || (profile.role === "commander" && commandersCanApprove() && !!profile.company_id);
  let pending = 0;
  if (canApprove) {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profiles where status = 'pending' and onboarded_at is not null ${profile.role === "admin" ? "" : "and company_id = $1"}`,
      profile.role === "admin" ? [] : [profile.company_id],
    );
    pending = rows[0]?.n ?? 0;
  }

  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-4 sm:pt-6">
        {pending > 0 ? (
          <Link
            href="/admin"
            className="mb-4 flex animate-rise items-center gap-3 rounded-card border border-gold/30 bg-gold-soft px-4 py-3 text-sm font-semibold text-fg shadow-[var(--shadow-sm)] transition-colors hover:border-gold/60"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-gold text-white">
              <UserRoundCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1">
              {pending === 1 ? "משתמש חדש ממתין לאישור שלך" : `${pending} משתמשים חדשים ממתינים לאישור שלך`}
            </span>
            <ChevronLeft className="size-5 text-muted" aria-hidden="true" />
          </Link>
        ) : null}
        <AppGrid
          apps={apps}
          tags={tags}
          firstName={(profile.full_name ?? "").split(" ")[0]}
          unit={[profile.company_name, profile.platoon_name].filter(Boolean).join(" · ")}
          initialTag={typeof tag === "string" ? tag : null}
        />
      </main>
    </>
  );
}
