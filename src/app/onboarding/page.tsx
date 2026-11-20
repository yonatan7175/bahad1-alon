import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { requireApproval } from "@/platform/server/config";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingForm } from "./form";

export const metadata: Metadata = { title: "פרטים ראשונים" };

export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect("/signin?next=/onboarding");
  if (s.profile.status === "approved") redirect("/");
  if (s.profile.status === "blocked") redirect("/blocked");
  const db = await getDb();
  const companies = (await db.query<{ id: string; name: string }>("select id, name from public.companies order by sort, name")).rows;
  return (
    <AuthShell step={2}>
      <h1 className="text-2xl font-extrabold">נעים להכיר 👋</h1>
      <p className="mt-1 text-muted">{requireApproval() ? "כמה פרטים קצרים, ואז מנהל יאשר את הכניסה שלך." : "כמה פרטים קצרים — ונכנסים."}</p>
      {companies.length === 0 ? (
        <p className="mt-5 rounded-ctl bg-surface-2 p-4 text-sm">עדיין לא הוגדרו פלוגות באתר. נסו שוב מאוחר יותר או פנו למנהל.</p>
      ) : (
        <OnboardingForm
          companies={companies}
          approval={requireApproval()}
          initial={{
            name: s.profile.full_name ?? "",
            room: s.profile.room ?? "",
            company: s.profile.company_id ?? "",
            team: s.profile.platoon_name?.match(/^צוות (\d+)$/)?.[1] ?? "",
            phone: s.profile.phone ?? "",
          }}
        />
      )}
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        לא נאסף כאן מספר אישי, תעודת זהות, כתובת או מידע רפואי — ואין להזין אותם בשום מקום באתר.
      </p>
    </AuthShell>
  );
}
