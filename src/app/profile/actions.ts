"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { normalizePhone, normalizeRoom } from "@/lib/validate";
import { changePassword } from "@/platform/auth/password";
import { audit } from "@/platform/server/audit";

export async function savePhone(_prev: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") return { error: "צריך להתחבר מחדש." };
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (phone === undefined) return { error: "מספר לא תקין (נייד ישראלי, למשל 050-1234567)." };
  await (await getDb()).query("update public.profiles set phone = $2 where id = $1", [s.profile.id, phone]);
  revalidatePath("/profile");
  return { ok: true };
}

export async function savePrivacy(field: "show_phone" | "show_email", value: boolean): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") return { error: "צריך להתחבר מחדש." };
  if (field !== "show_phone" && field !== "show_email") return { error: "שדה לא תקין" };
  await (await getDb()).query(`update public.profiles set ${field} = $2 where id = $1`, [s.profile.id, value === true]);
  revalidatePath("/profile");
  revalidatePath("/people");
  return { ok: true };
}

export async function saveRoom(_prev: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") return { error: "צריך להתחבר מחדש." };
  const room = normalizeRoom(String(form.get("room") ?? ""));
  if (!room) return { error: "חדר לא קיים במגורים (קומות 2–4, חדרים 37–60, למשל 241)." };
  await (await getDb()).query("update public.profiles set room = $2 where id = $1", [s.profile.id, room]);
  revalidatePath("/profile");
  revalidatePath("/a/dorm");
  return { ok: true };
}


export async function savePassword(_prev: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") return { error: "צריך להתחבר מחדש." };
  const next = String(form.get("password") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "הסיסמאות החדשות לא תואמות." };
  const db = await getDb();
  const error = await changePassword(db, s.profile.id, String(form.get("current") ?? ""), next);
  if (error) return { error };
  await audit(db, s.profile.id, "user.password_change", s.profile.id, {});
  return { ok: true };
}
