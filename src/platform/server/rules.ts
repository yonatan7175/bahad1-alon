// Pure collection-rule logic (plan section 04 — Collection rules).
// Two forms of the same rule: JS predicates (single record) and a SQL fragment
// (lists). tests/rules.test.ts checks that both always agree.
import type { CollectionRule } from "../manifest";
import type { Role } from "../types";

export interface Actor {
  id: string;
  role: Role;
  companyId: string | null;
  platoonId: string | null;
  /** Manager of THIS app (public.app_managers, or an approved position that manages it): moderates its collections battalion-wide, like an admin. */
  appManager?: boolean;
  /**
   * Companies whose records the actor moderates in THIS app through a פלוגתי position (e.g. קל"פ of
   * פלוגה א'). Like appManager, but only for records owned by people in these companies.
   */
  managerCompanyIds?: string[];
}

export interface RecordOwnerInfo {
  ownerId: string;
  ownerCompanyId: string | null;
  ownerPlatoonId: string | null;
}

/** Moderation reach of the actor for this collection: every record, own company's records, or none. */
export function moderationScope(actor: Actor, rule: CollectionRule): "all" | "company" | null {
  if (rule.moderate !== "none" && actor.appManager) return "all";
  switch (rule.moderate) {
    case "none":
      return null;
    case "admin":
      return actor.role === "admin" ? "all" : null;
    case "commander":
      if (actor.role === "admin") return "all";
      if (actor.role === "commander" && actor.companyId) return "company";
      return null;
  }
}

export function canCreate(actor: Actor, rule: CollectionRule): boolean {
  switch (rule.create) {
    case "any":
      return true;
    case "commander":
      return actor.role === "commander" || actor.role === "admin";
    case "admin":
      return actor.role === "admin";
  }
}

function sameUnit(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

/** Is the record's owner in a company the actor manages through a פלוגתי position? */
function inManagedCompany(actor: Actor, rule: CollectionRule, rec: RecordOwnerInfo): boolean {
  return rule.moderate !== "none" && rec.ownerCompanyId !== null && !!actor.managerCompanyIds?.includes(rec.ownerCompanyId);
}

export function canRead(actor: Actor, rule: CollectionRule, rec: RecordOwnerInfo): boolean {
  if (rec.ownerId === actor.id) return true;
  const mod = moderationScope(actor, rule);
  if (mod === "all") return true;
  if (mod === "company" && sameUnit(rec.ownerCompanyId, actor.companyId)) return true;
  if (inManagedCompany(actor, rule, rec)) return true;
  switch (rule.read) {
    case "own":
      return false;
    case "platoon":
      return sameUnit(rec.ownerPlatoonId, actor.platoonId);
    case "company":
      return sameUnit(rec.ownerCompanyId, actor.companyId);
    case "all":
      return true;
  }
}

/** Update / delete: own records, or records inside the actor's moderation reach. */
export function canWrite(actor: Actor, rule: CollectionRule, rec: RecordOwnerInfo): boolean {
  if (rec.ownerId === actor.id) return true;
  const mod = moderationScope(actor, rule);
  if (mod === "all") return true;
  if (mod === "company" && sameUnit(rec.ownerCompanyId, actor.companyId)) return true;
  if (inManagedCompany(actor, rule, rec)) return true;
  return false;
}

/**
 * SQL boolean expression equivalent to canRead(). Uses alias `r` for
 * app_records and `o` for the owner's profiles row. Pushes parameters onto
 * `params` and references them by position.
 */
export function readVisibilitySql(actor: Actor, rule: CollectionRule, params: unknown[]): string {
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const mod = moderationScope(actor, rule);
  // Decide before pushing any parameter: unused $n parameters are an error in Postgres.
  if (mod === "all" || rule.read === "all") return "true";
  const parts: string[] = [`r.owner_id = ${p(actor.id)}::uuid`];
  const companyVisible = (mod === "company" || rule.read === "company") && actor.companyId;
  if (companyVisible) parts.push(`o.company_id = ${p(actor.companyId)}::uuid`);
  if (rule.read === "platoon" && actor.platoonId) parts.push(`o.platoon_id = ${p(actor.platoonId)}::uuid`);
  if (rule.moderate !== "none" && actor.managerCompanyIds?.length) parts.push(`o.company_id = any(${p(actor.managerCompanyIds)}::uuid[])`);
  return `(${parts.join(" or ")})`;
}
