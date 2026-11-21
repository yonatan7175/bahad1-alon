"use server";
// Positions (תפקידים): ask for one, cancel the request, or give it up. Admins decide in /admin?tab=positions.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { leavePosition, PositionError, requestPosition } from "@/platform/server/positions";

function done(msg: { ok?: string; error?: string }): never {
  revalidatePath("/roles");
  revalidatePath("/profile");
  revalidatePath("/people");
  redirect(`/roles?${new URLSearchParams(msg as Record<string, string>)}`);
}

export async function askPosition(form: FormData): Promise<void> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") redirect("/signin?next=/roles");
  const position = String(form.get("position") ?? "");
  if (!position) done({ error: "יש לבחור תפקיד" });
  let result: "requested" | "unchanged";
  try {
    result = await requestPosition(await getDb(), s.profile.id, position, String(form.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof PositionError) done({ error: e.message });
    throw e;
  }
  done(result === "requested" ? { ok: "הבקשה נשלחה למנהל האתר" } : { error: "כבר ביקשת את התפקיד הזה" });
}

export async function dropPosition(form: FormData): Promise<void> {
  const s = await getSession();
  if (!s || s.profile.status !== "approved") redirect("/signin?next=/roles");
  try {
    await leavePosition(await getDb(), s.profile.id, String(form.get("position") ?? ""));
  } catch (e) {
    if (e instanceof PositionError) done({ error: e.message });
    throw e;
  }
  done({ ok: "עודכן" });
}
