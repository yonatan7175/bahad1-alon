import type { Metadata } from "next";
import { BadgeCheck, Check, X } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { myPositions } from "@/platform/server/positions";
import { PortalHeader } from "@/components/portal-header";
import { MyPositionsList, RequestPositionForm } from "./positions-ui";

export const metadata: Metadata = { title: "בקשה לתפקיד" };

export default async function RolesPage(props: PageProps<"/roles">) {
  const session = await requireApproved("/roles");
  const positions = await myPositions(await getDb(), session.profile.id);
  const sp = await props.searchParams;
  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <p className="section-title">תפקידים</p>
        <h1 className="mt-1 text-3xl font-extrabold">בקשה לתפקיד</h1>
        <p className="mt-1 text-sm text-muted">
          בעלי תפקיד מנהלים את האפליקציות של התחום שלהם, והתפקיד מופיע ליד השם שלהם באתר. אפשר לבקש כמה תפקידים; מנהל האתר מאשר כל בקשה.
        </p>
        {typeof sp.error === "string" ? (
          <p role="alert" className="mt-4 flex items-center gap-2 rounded-ctl border border-danger/20 bg-danger-soft p-3 text-sm font-medium text-danger">
            <X className="size-4 shrink-0" aria-hidden="true" />
            {sp.error}
          </p>
        ) : null}
        {typeof sp.ok === "string" ? (
          <p role="status" className="mt-4 flex animate-rise items-center gap-2 rounded-ctl border border-accent/20 bg-accent-soft p-3 text-sm font-medium text-accent-ink">
            <Check className="size-4 shrink-0" aria-hidden="true" />
            {sp.ok}
          </p>
        ) : null}

        <section className="card mt-5">
          <h2 className="flex items-center gap-2.5 text-base font-bold">
            <span className="flex size-8 items-center justify-center rounded-ctl bg-accent-soft text-accent [&_svg]:size-[18px]">
              <BadgeCheck aria-hidden="true" />
            </span>
            בקשה חדשה
          </h2>
          <div className="mt-3">
            <RequestPositionForm positions={positions} company={session.profile.company_name} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">התפקידים שלי</h2>
          <MyPositionsList positions={positions} />
        </section>
      </main>
    </>
  );
}
