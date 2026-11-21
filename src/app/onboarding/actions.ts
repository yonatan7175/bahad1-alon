"use server";
import { redirect } from "next/navigation";
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { audit } from "@/platform/server/audit";
import { requireApproval } from "@/platform/server/config";
import { normalizePhone, normalizeRoom, teamPlatoonName, validHebrewName } from "@/lib/validate";

export interface OnboardingState {
  error?: string;
}

export async function saveOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const s = await getSession();
  if (!s) redirect("/signin");
  if (s.profile.status !== "pending") redirect("/");
  const name = validHebrewName(String(form.get("name") ?? ""));
  if (!name) return { error: "יש להזין שם מלא בעברית (2–40 תווים)." };
  const room = normalizeRoom(String(form.get("room") ?? ""));
  if (!room) return { error: "יש להזין מספר חדר במגורים: קומות 2–4, חדרים 37–60 (למשל 241)." };
  const companyId = String(form.get("company") ?? "");
  const team = teamPlatoonName(String(form.get("team") ?? ""));
  if (!team) return { error: "יש להזין מספר צוות (1–30)." };
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) return { error: "יש להזין טלפון נייד תקין (למשל 050-1234567)." };
  const db = await getDb();
  const c = await db.query("select 1 from public.companies where id::text = $1", [companyId]);
  if (!c.rows.length) return { error: "יש לבחור פלוגה." };
  // The team is the platoon "צוות <n>" of the chosen company, created on first use.
  const { rows } = await db.query<{ id: string }>(
    `insert into public.platoons (company_id, name) values ($1::uuid, $2)
     on conflict (company_id, name) do update set name = excluded.name returning id`,
    [companyId, team],
  );
  await db.query(
    `update public.profiles set full_name = $2, company_id = $3::uuid, platoon_id = $4, phone = $5, room = $6, onboarded_at = now()
      where id = $1 and status = 'pending'`,
    [s.profile.id, name, companyId, rows[0].id, phone, room],
  );
  if (requireApproval()) redirect("/pending");
  // Open registration: the account is created (approved) right away.
  const done = await db.query(
    "update public.profiles set status = 'approved', approved_at = now() where id = $1 and status = 'pending' returning id",
    [s.profile.id],
  );
  if (done.rows.length) await audit(db, null, "user.auto_approve", s.profile.id, { email: s.profile.email });
  redirect("/");
}
