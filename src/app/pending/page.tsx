import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Hourglass, Pencil } from "lucide-react";
import { getSession } from "@/platform/auth/session";
import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { RefreshButton } from "@/components/refresh-button";

export const metadata: Metadata = { title: "מחכה לאישור מנהל" };

export default async function Pending() {
  const s = await getSession();
  if (!s) redirect("/signin");
  if (s.profile.status === "approved") redirect("/");
  if (s.profile.status === "blocked") redirect("/blocked");
  if (!s.profile.onboarded_at) redirect("/onboarding");
  const p = s.profile;
  return (
    <AuthShell step={3}>
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Hourglass className="size-7 animate-pulse" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">מחכה לאישור מנהל</h1>
        <p className="mt-2 text-muted">הפרטים נשלחו. ברגע שמנהל יאשר — האתר ייפתח עבורך.</p>
      </div>
      <dl className="mt-5 divide-y divide-line rounded-ctl border border-line text-sm">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <dt className="text-muted">סטטוס</dt>
          <dd data-testid="account-status">
            <span className="badge-warning">מחכה לאישור מנהל</span>
          </dd>
        </div>
        <div className="flex justify-between gap-2 px-4 py-3">
          <dt className="text-muted">שם</dt>
          <dd className="font-semibold">{p.full_name}</dd>
        </div>
        <div className="flex justify-between gap-2 px-4 py-3">
          <dt className="text-muted">יחידה</dt>
          <dd className="font-semibold">{[p.company_name, p.platoon_name].filter(Boolean).join(" · ")}</dd>
        </div>
      </dl>
      <div className="mt-5 grid gap-2">
        <RefreshButton />
        <div className="grid grid-cols-2 gap-2">
          <Link href="/onboarding" className="btn-secondary">
            <Pencil className="size-4" aria-hidden="true" /> עריכת פרטים
          </Link>
          <SignOutButton />
        </div>
      </div>
    </AuthShell>
  );
}
