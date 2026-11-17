// Runtime view of the app registry: the generated manifests + admin overrides.
import { REGISTRY, TAGS } from "@/generated/registry";
import type { RegistryApp } from "../manifest";
import type { Role } from "../types";
import type { Db } from "./db-core";

export type EffectiveStatus = "live" | "beta" | "hidden" | "disabled";

export interface Override {
  status: "hidden" | "disabled";
  reason: string | null;
}

export function allApps(): readonly RegistryApp[] {
  return REGISTRY;
}

export function allTags(): readonly string[] {
  return TAGS;
}

export function getApp(slug: string): RegistryApp | undefined {
  return REGISTRY.find((a) => a.slug === slug);
}

export async function loadOverrides(db: Db): Promise<Map<string, Override>> {
  const { rows } = await db.query<{ app_slug: string; status: "hidden" | "disabled"; reason: string | null }>(
    "select app_slug, status, reason from public.app_overrides",
  );
  return new Map(rows.map((r) => [r.app_slug, { status: r.status, reason: r.reason }]));
}

export async function loadOverride(db: Db, slug: string): Promise<Override | null> {
  const { rows } = await db.query<{ status: "hidden" | "disabled"; reason: string | null }>(
    "select status, reason from public.app_overrides where app_slug = $1",
    [slug],
  );
  return rows[0] ?? null;
}

export function effectiveStatus(app: RegistryApp, override: Override | null | undefined): EffectiveStatus {
  if (override?.status === "disabled") return "disabled";
  if (override?.status === "hidden") return "hidden";
  return app.status;
}

/** Can a user with this role open/use the app? (hidden ⇒ admins only, disabled ⇒ nobody) */
export function canUseApp(app: RegistryApp, status: EffectiveStatus, role: Role): boolean {
  if (status === "disabled") return false;
  if (!app.audience.includes(role)) return false;
  if (status === "hidden") return role === "admin";
  return true;
}

/** Apps shown on the home grid for this role. */
export function visibleApps(role: Role, overrides: Map<string, Override>): { app: RegistryApp; status: EffectiveStatus }[] {
  return REGISTRY.map((app) => ({ app, status: effectiveStatus(app, overrides.get(app.slug)) })).filter(
    ({ app, status }) => canUseApp(app, status, role),
  );
}
