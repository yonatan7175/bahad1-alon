import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { commandersCanApprove } from "@/platform/server/config";
import { allApps, effectiveStatus, loadOverrides } from "@/platform/server/registry";
import { SENSITIVE_SCOPES } from "@/platform/manifest";
import { ROLE_LABEL, SCOPE_LABEL, STATUS_LABEL } from "@/lib/site";
import { PortalHeader } from "@/components/portal-header";
import { Avatar } from "@/components/avatar";
import { AppWindow, BadgeCheck, Building2, Check, History, Plus, Search, ShieldAlert, Trash2, UserRoundCheck, Users, X } from "lucide-react";
import { appRef, linkRef, listHolders, listPositions, pendingPositionCount, positionLabel, POSITION_SCOPE_LABEL } from "@/platform/server/positions";
import * as A from "./actions";

export const metadata: Metadata = { title: "ניהול" };

const TABS = [
  ["users", "משתמשים", Users],
  ["units", "פלוגות ומחלקות", Building2],
  ["positions", "תפקידים", BadgeCheck],
  ["apps", "אפליקציות", AppWindow],
  ["audit", "יומן", History],
] as const;

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  company_id: string | null;
  platoon_id: string | null;
  company_name: string | null;
  platoon_name: string | null;
  phone: string | null;
  room: string | null;
  created_at: Date;
  onboarded_at: Date | null;
  last_seen_at: Date | null;
}

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function AdminPage(props: PageProps<"/admin">) {
  const s = await getSession();
  if (!s) redirect("/signin?next=/admin");
  const me = s.profile;
  const isAdmin = me.status === "approved" && me.role === "admin";
  const isApprover = isAdmin || (me.status === "approved" && me.role === "commander" && commandersCanApprove() && !!me.company_id);
  if (!isApprover) redirect("/");
  const sp = await props.searchParams;
  const tab = isAdmin && typeof sp.tab === "string" && TABS.some(([t]) => t === sp.tab) ? sp.tab : "users";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const db = await getDb();
  const companies = (await db.query<{ id: string; name: string; sort: number }>("select id, name, sort from public.companies order by sort, name")).rows;
  const platoons = (await db.query<{ id: string; name: string; company_id: string }>("select id, name, company_id from public.platoons order by name")).rows;

  const stats = (
    await db.query<{ pending: number; approved: number; blocked: number; overrides: number }>(
      `select (select count(*)::int from public.profiles where status = 'pending' and onboarded_at is not null) as pending,
              (select count(*)::int from public.profiles where status = 'approved') as approved,
              (select count(*)::int from public.profiles where status = 'blocked') as blocked,
              (select count(*)::int from public.app_overrides) as overrides`,
    )
  ).rows[0];
  const pendingPositions = isAdmin ? await pendingPositionCount(db) : 0;

  return (
    <>
      <PortalHeader session={s} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="section-title">לוח בקרה</p>
            <h1 className="mt-1 text-3xl font-extrabold">ניהול</h1>
          </div>
        </div>
        {isAdmin ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<UserRoundCheck />} label="ממתינים לאישור" value={stats.pending} tone={stats.pending ? "gold" : "plain"} />
            <Stat icon={<Users />} label="משתמשים פעילים" value={stats.approved} />
            <Stat icon={<ShieldAlert />} label="חסומים" value={stats.blocked} />
            <Stat icon={<AppWindow />} label="אפליקציות" value={allApps().length} hint={stats.overrides ? `${stats.overrides} עם עקיפה` : undefined} />
          </div>
        ) : (
          <p className="mt-1 text-muted">אישור משתמשים חדשים מהפלוגה שלך.</p>
        )}
        {isAdmin ? (
          <nav className="-mx-4 mt-6 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="לשוניות ניהול">
            <div className="flex gap-1 rounded-card bg-surface-2 p-1">
              {TABS.map(([t, label, Icon]) => (
                <Link
                  key={t}
                  href={`/admin?tab=${t}`}
                  aria-current={tab === t ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-ctl px-3.5 text-sm font-semibold transition-colors ${
                    tab === t ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                  {t === "users" && stats.pending ? <span className="badge-danger">{stats.pending}</span> : null}
                  {t === "positions" && pendingPositions ? <span className="badge-danger">{pendingPositions}</span> : null}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
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

        {tab === "users" ? <UsersTab db={db} isAdmin={isAdmin} myCompany={me.company_id} q={q} companies={companies} platoons={platoons} /> : null}
        {tab === "units" ? <UnitsTab companies={companies} platoons={platoons} /> : null}
        {tab === "positions" ? <PositionsTab db={db} /> : null}
        {tab === "apps" ? <AppsTab db={db} /> : null}
        {tab === "audit" ? <AuditTab db={db} /> : null}
      </main>
    </>
  );
}

function Stat({ icon, label, value, hint, tone = "plain" }: { icon: ReactNode; label: string; value: number; hint?: string; tone?: "plain" | "gold" }) {
  return (
    <div className={`rounded-card border p-4 shadow-[var(--shadow-sm)] ${tone === "gold" ? "border-gold/30 bg-gold-soft" : "border-line bg-surface"}`}>
      <span className={`flex size-9 items-center justify-center rounded-ctl [&_svg]:size-[18px] ${tone === "gold" ? "bg-gold text-white" : "bg-surface-2 text-muted"}`}>
        {icon}
      </span>
      <p className="mt-3 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted">
        {label}
        {hint ? ` · ${hint}` : ""}
      </p>
    </div>
  );
}

async function UsersTab({
  db,
  isAdmin,
  myCompany,
  q,
  companies,
  platoons,
}: {
  db: Awaited<ReturnType<typeof getDb>>;
  isAdmin: boolean;
  myCompany: string | null;
  q: string;
  companies: { id: string; name: string }[];
  platoons: { id: string; name: string; company_id: string }[];
}) {
  const base = `select p.id, p.email, p.full_name, p.role, p.status, p.company_id, p.platoon_id, c.name as company_name, pl.name as platoon_name,
                       p.phone, p.room, p.created_at, p.onboarded_at, p.last_seen_at
                  from public.profiles p left join public.companies c on c.id = p.company_id left join public.platoons pl on pl.id = p.platoon_id`;
  const pending = (
    await db.query<UserRow>(
      `${base} where p.status = 'pending' ${isAdmin ? "" : "and p.company_id = $1"} order by p.onboarded_at nulls last, p.created_at`,
      isAdmin ? [] : [myCompany],
    )
  ).rows;
  const all = isAdmin
    ? (
        await db.query<UserRow>(
          `${base} where p.status <> 'pending' and ($1 = '' or p.full_name ilike '%' || $1 || '%' or p.email ilike '%' || $1 || '%')
            order by p.status, c.sort nulls first, pl.name nulls first, p.full_name limit 300`,
          [q],
        )
      ).rows
    : [];

  return (
    <div className="mt-4 space-y-6">
      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          ממתינים לאישור <span className="badge-warning">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-sm text-muted">
            <Check className="size-4 text-success" aria-hidden="true" /> אין בקשות חדשות.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {pending.map((u) => (
            <li key={u.id} className="card flex animate-rise flex-wrap items-center justify-between gap-3 border-gold/30 p-4" data-testid="pending-user">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={u.full_name ?? u.email} url={null} size={42} />
                <div className="min-w-0">
                <p className="font-bold">{u.full_name ?? "(ללא שם)"}</p>
                <p className="text-sm text-muted">
                  {[u.company_name, u.platoon_name, u.room ? `חדר ${u.room}` : null].filter(Boolean).join(" · ") || "לא מילא/ה פרטים"} ·{" "}
                  <span dir="ltr">{u.email}</span>
                  {u.phone ? (
                    <>
                      {" · "}
                      <span dir="ltr">{u.phone}</span>
                    </>
                  ) : null}
                </p>
                {!u.onboarded_at ? <p className="text-xs text-warning">עדיין לא סיים/ה את טופס הפרטים</p> : null}
                </div>
              </div>
              <div className="flex gap-2">
                <form action={A.approveUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" className="btn">
                    <Check className="size-4" aria-hidden="true" /> אישור
                  </button>
                </form>
                <form action={A.rejectUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" className="btn-secondary">
                    <X className="size-4" aria-hidden="true" /> דחייה
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin ? (
        <section>
          <h2 className="text-lg font-bold">כל המשתמשים</h2>
          <form className="relative mt-3 flex gap-2" action="/admin">
            <input type="hidden" name="tab" value="users" />
            <label htmlFor="q" className="sr-only">
              חיפוש
            </label>
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input id="q" name="q" defaultValue={q} placeholder="חיפוש לפי שם או אימייל" className="field ps-10" />
            <button className="btn-secondary" type="submit">
              חיפוש
            </button>
          </form>
          <ul className="mt-3 list-group">
            {all.map((u) => (
              <li key={u.id}>
                <details className="group">
                  <summary className="list-row cursor-pointer list-none hover:bg-surface-2">
                    <Avatar name={u.full_name ?? u.email} url={null} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{u.full_name ?? "(ללא שם)"}</span>
                        {u.status === "blocked" ? <span className="badge-danger">{STATUS_LABEL[u.status]}</span> : null}
                        {u.role !== "cadet" ? <span className="badge-accent">{ROLE_LABEL[u.role]}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {[u.company_name, u.platoon_name, u.room ? `חדר ${u.room}` : null].filter(Boolean).join(" · ") || "ללא יחידה"}
                      </span>
                    </span>
                    <span className="text-xs text-subtle group-open:hidden">עריכה</span>
                  </summary>
                  <div className="border-t border-line bg-bg-elevated px-4 pb-4 pt-3 text-sm">
                    <p className="text-muted">
                      <span dir="ltr">{u.email}</span>
                      {u.phone ? (
                        <>
                          {" · "}
                          <span dir="ltr">{u.phone}</span>
                        </>
                      ) : null}{" "}
                      · נראה לאחרונה: {fmt(u.last_seen_at)}
                    </p>
                    <form action={A.updateUser} className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="id" value={u.id} />
                      <label className="block">
                        <span className="label mt-0">שם</span>
                        <input name="name" defaultValue={u.full_name ?? ""} className="field" required />
                      </label>
                      <label className="block">
                        <span className="label mt-0">סוג משתמש</span>
                        <select name="role" defaultValue={u.role} className="field">
                          {Object.entries(ROLE_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="label mt-0">פלוגה</span>
                        <select name="company" defaultValue={u.company_id ?? ""} className="field">
                          <option value="">ללא</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="label mt-0">מחלקה (חייבת להתאים לפלוגה)</span>
                        <select name="platoon" defaultValue={u.platoon_id ?? ""} className="field">
                          <option value="">ללא</option>
                          {companies.map((c) => (
                            <optgroup key={c.id} label={c.name}>
                              {platoons
                                .filter((p) => p.company_id === c.id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" className="btn">
                          שמירה
                        </button>
                      </div>
                    </form>
                    <form action={A.setBlocked} className="mt-4 border-t border-line pt-4">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="block" value={u.status === "blocked" ? "0" : "1"} />
                      <button type="submit" className={u.status === "blocked" ? "btn-secondary" : "btn-danger"}>
                        {u.status === "blocked" ? "הסרת חסימה" : "חסימה (ניתוק מכל המכשירים)"}
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function UnitsTab({ companies, platoons }: { companies: { id: string; name: string }[]; platoons: { id: string; name: string; company_id: string }[] }) {
  return (
    <div className="mt-4 space-y-3">
      <form action={A.addCompany} className="card flex flex-wrap items-end gap-2 border-dashed">
        <label className="min-w-0 flex-1">
          <span className="label mt-0">פלוגה חדשה</span>
          <input name="name" required maxLength={40} className="field" placeholder="למשל: פלוגה א'" />
        </label>
        <button className="btn" type="submit">
          <Plus className="size-4" aria-hidden="true" /> הוספה
        </button>
      </form>
      {companies.map((c) => (
        <section key={c.id} className="card">
          <div className="flex flex-wrap items-end gap-2">
            <form action={A.renameCompany} className="flex min-w-0 flex-1 gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label className="sr-only" htmlFor={`c-${c.id}`}>
                שם הפלוגה
              </label>
              <input id={`c-${c.id}`} name="name" defaultValue={c.name} className="field font-bold" />
              <button className="btn-secondary" type="submit">
                שינוי שם
              </button>
            </form>
            <form action={A.deleteCompany}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-ghost text-danger" type="submit">
                <Trash2 className="size-4" aria-hidden="true" /> מחיקה
              </button>
            </form>
          </div>
          <ul className="mt-4 space-y-2 border-s-2 border-accent/30 ps-4">
            {platoons
              .filter((p) => p.company_id === c.id)
              .map((p) => (
                <li key={p.id} className="flex flex-wrap gap-2">
                  <form action={A.renamePlatoon} className="flex min-w-0 flex-1 gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="sr-only" htmlFor={`p-${p.id}`}>
                      שם המחלקה
                    </label>
                    <input id={`p-${p.id}`} name="name" defaultValue={p.name} className="field" />
                    <button className="btn-secondary" type="submit">
                      שינוי
                    </button>
                  </form>
                  <form action={A.deletePlatoon}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="icon-btn text-danger" type="submit" aria-label={`מחיקת ${p.name}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            <li>
              <form action={A.addPlatoon} className="flex gap-2">
                <input type="hidden" name="company" value={c.id} />
                <label className="sr-only" htmlFor={`np-${c.id}`}>
                  מחלקה חדשה
                </label>
                <input id={`np-${c.id}`} name="name" required maxLength={40} placeholder="מחלקה חדשה" className="field" />
                <button className="btn" type="submit">
                  הוספה
                </button>
              </form>
            </li>
          </ul>
        </section>
      ))}
    </div>
  );
}

async function PositionsTab({ db }: { db: Awaited<ReturnType<typeof getDb>> }) {
  const [positions, holders] = await Promise.all([listPositions(db), listHolders(db)]);
  const people = (
    await db.query<{ id: string; full_name: string | null; email: string }>(
      "select id, full_name, email from public.profiles where status = 'approved' order by full_name nulls last limit 2000",
    )
  ).rows;
  const sites = (
    await db.query<{ id: string; name: string }>("select id, name from public.app_submissions where kind = 'url' and status = 'approved' order by name")
  ).rows;
  // What a position can manage: built-in apps (manager powers inside the portal) and approved websites
  // (recorded only, for the shared login later).
  const choices = [
    ...allApps()
      .filter((a) => a.tier === "external" || Object.keys(a.collections).length > 0)
      .map((a) => ({ ref: appRef(a.slug), name: a.name, site: a.tier === "external" })),
    ...sites.map((x) => ({ ref: linkRef(x.id), name: x.name, site: true })),
  ];
  const nameOf = new Map(choices.map((c) => [c.ref, c.name]));
  const posName = new Map(positions.map((p) => [p.id, p.name]));
  const pending = holders.filter((h) => h.status === "pending");

  return (
    <div className="mt-4 space-y-6">
      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          בקשות לתפקיד <span className="badge-warning">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-sm text-muted">
            <Check className="size-4 text-success" aria-hidden="true" /> אין בקשות חדשות.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {pending.map((h) => (
            <li key={`${h.positionId}-${h.profileId}`} className="card animate-rise border-gold/30 p-4" data-testid="position-request">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={h.name ?? h.email} url={null} size={42} />
                  <div className="min-w-0">
                    <p className="font-bold">
                      {h.name ?? "(ללא שם)"} ← <span className="badge-accent">{positionLabel(posName.get(h.positionId) ?? "", h.companyName)}</span>
                    </p>
                    <p className="text-sm text-muted">
                      <span dir="ltr">{h.email}</span> · {fmt(h.requestedAt)}
                    </p>
                    {h.reason ? <p className="mt-1 text-sm">&quot;{h.reason}&quot;</p> : null}
                  </div>
                </div>
                <form action={A.approvePosition}>
                  <input type="hidden" name="position" value={h.positionId} />
                  <input type="hidden" name="user" value={h.profileId} />
                  <button type="submit" className="btn">
                    <Check className="size-4" aria-hidden="true" /> אישור
                  </button>
                </form>
              </div>
              <form action={A.rejectPosition} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="position" value={h.positionId} />
                <input type="hidden" name="user" value={h.profileId} />
                <label className="sr-only" htmlFor={`rj-${h.positionId}-${h.profileId}`}>
                  סיבת הדחייה
                </label>
                <input id={`rj-${h.positionId}-${h.profileId}`} name="note" maxLength={200} placeholder="סיבה (לא חובה, המבקש/ת יראו אותה)" className="field min-w-0 flex-1" />
                <button type="submit" className="btn-secondary">
                  <X className="size-4" aria-hidden="true" /> דחייה
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">התפקידים</h2>
        <p className="text-sm text-muted">
          בעל/ת תפקיד מאושר/ת מנהל/ת את האפליקציות שמסומנות לתפקיד, כמו &quot;מנהלי האפליקציה&quot;: תפקיד גדודי — את כל הרשומות בגדוד; תפקיד פלוגתי — רק את הרשומות של אנשי הפלוגה שאליה התפקיד רשום (הפלוגה של המבקש/ת ברגע הבקשה או המינוי). באתרים חיצוניים התפקיד רק נשמר — הוא יועבר לאתר כשתהיה התחברות משותפת.
        </p>
        {positions.map((p) => {
          const held = holders.filter((h) => h.positionId === p.id && h.status === "approved");
          return (
            <div key={p.id} className="card" data-testid="position-card">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                  <span className="text-base font-bold">{p.name}</span>
                  <span className="badge-hidden">{POSITION_SCOPE_LABEL[p.scope]}</span>
                  <span className="text-sm text-muted">{p.apps.map((r) => nameOf.get(r) ?? "(הוסר)").join(" · ") || "בלי אפליקציות"}</span>
                  <span className="ms-auto text-xs text-subtle">עריכה</span>
                </summary>
                <form action={A.updatePosition} className="mt-3 grid gap-2 border-t border-line pt-3">
                  <input type="hidden" name="position" value={p.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="label mt-0">שם</span>
                      <input name="name" defaultValue={p.name} required maxLength={30} className="field" />
                    </label>
                    <label className="block">
                      <span className="label mt-0">תיאור</span>
                      <input name="description" defaultValue={p.description} maxLength={200} className="field" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label mt-0">רמה</span>
                      <select name="scope" defaultValue={p.scope} className="field">
                        <option value="company">פלוגתי — כל מחזיק/ה רשום/ה לפלוגה שלו/ה ומנהל/ת רק אותה</option>
                        <option value="battalion">גדודי — מנהל/ת את כל הגדוד</option>
                      </select>
                    </label>
                  </div>
                  <fieldset>
                    <legend className="label mt-0">מנהל/ת את</legend>
                    <div className="flex flex-wrap gap-2">
                      {choices.map((c) => (
                        <label key={c.ref} className="chip flex min-h-11 cursor-pointer items-center gap-2">
                          <input type="checkbox" name="apps" value={c.ref} defaultChecked={p.apps.includes(c.ref)} className="size-4" />
                          {c.name}
                          {c.site ? <span className="text-xs text-subtle">(אתר)</span> : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="btn">
                      שמירה
                    </button>
                  </div>
                </form>
                <form action={A.deletePosition} className="mt-2">
                  <input type="hidden" name="position" value={p.id} />
                  <button type="submit" className="btn-ghost text-danger">
                    <Trash2 className="size-4" aria-hidden="true" /> מחיקת התפקיד (וכל מי שמחזיק בו)
                  </button>
                </form>
              </details>

              <div className="mt-3 border-t border-line pt-3">
                <p className="text-sm font-semibold">מחזיקים בתפקיד</p>
                {held.length === 0 ? <p className="text-sm text-muted">אף אחד עדיין.</p> : null}
                <ul className="mt-2 flex flex-wrap gap-2">
                  {held.map((h) => (
                    <li key={h.profileId}>
                      <form action={A.removePositionHolder} className="chip flex items-center gap-1.5">
                        <input type="hidden" name="position" value={p.id} />
                        <input type="hidden" name="user" value={h.profileId} />
                        {h.name ?? h.email}
                        {p.scope === "company" ? <span className="text-xs text-muted">({h.companyName ?? "ללא פלוגה — לא מנהל/ת כלום"})</span> : null}
                        <button type="submit" className="text-muted hover:text-danger" aria-label={`הסרת ${h.name ?? ""} מהתפקיד ${p.name}`}>
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={A.assignPosition} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="position" value={p.id} />
                  <label className="sr-only" htmlFor={`as-${p.id}`}>
                    מינוי ישיר ל{p.name}
                    {p.scope === "company" ? " (לפלוגה של המשתמש/ת)" : ""}
                  </label>
                  <select id={`as-${p.id}`} name="user" defaultValue="" className="field w-auto max-w-full">
                    <option value="" disabled>
                      מינוי ישיר…
                    </option>
                    {people.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name ?? u.email}
                      </option>
                    ))}
                  </select>
                  <button className="btn-secondary" type="submit">
                    <Plus className="size-4" aria-hidden="true" /> מינוי
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        <form action={A.createPosition} className="card flex flex-wrap items-end gap-2 border-dashed">
          <label className="min-w-0 flex-1">
            <span className="label mt-0">תפקיד חדש</span>
            <input name="name" required maxLength={30} className="field" placeholder='למשל: קמב"ץ' />
          </label>
          <label className="min-w-0 flex-[2]">
            <span className="label mt-0">תיאור</span>
            <input name="description" maxLength={200} className="field" placeholder="מה התפקיד מנהל" />
          </label>
          <label className="min-w-0">
            <span className="label mt-0">רמה</span>
            <select name="scope" defaultValue="company" className="field">
              <option value="company">פלוגתי</option>
              <option value="battalion">גדודי</option>
            </select>
          </label>
          <button className="btn" type="submit">
            <Plus className="size-4" aria-hidden="true" /> הוספה
          </button>
        </form>
      </section>
    </div>
  );
}

async function AppsTab({ db }: { db: Awaited<ReturnType<typeof getDb>> }) {
  const overrides = await loadOverrides(db);
  const managers = (
    await db.query<{ app_slug: string; profile_id: string; full_name: string | null }>(
      `select m.app_slug, m.profile_id, p.full_name from public.app_managers m
         join public.profiles p on p.id = m.profile_id order by p.full_name`,
    )
  ).rows;
  const people = (
    await db.query<{ id: string; full_name: string | null; email: string }>(
      "select id, full_name, email from public.profiles where status = 'approved' order by full_name nulls last limit 2000",
    )
  ).rows;
  return (
    <ul className="mt-4 space-y-2">
      {allApps().map((a) => {
        const o = overrides.get(a.slug);
        const eff = effectiveStatus(a, o);
        return (
          <li key={a.slug} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- static icon */}
                <img src={a.iconUrl} alt="" width={44} height={44} className="rounded-xl shadow-[var(--shadow-sm)]" />
                <div>
                  <p className="font-semibold">
                    {a.name} <span className="text-xs text-muted" dir="ltr">/{a.slug} · v{a.version} · {a.tier}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                    <span className={eff === "disabled" ? "badge-danger" : eff === "hidden" ? "badge-hidden" : "badge-accent"}>
                      {({ live: "פעילה", hidden: "מוסתרת", disabled: "מושבתת" } as const)[eff]}
                    </span>
                    {o ? <span>(עקיפת מנהל{o.reason ? `: ${o.reason}` : ""})</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    הרשאות:{" "}
                    {a.effectiveScopes.map((sc) => (
                      <span key={sc} className={SENSITIVE_SCOPES.includes(sc) ? "font-bold text-warning" : ""}>
                        {SCOPE_LABEL[sc]}
                        {" · "}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              <form action={A.setAppOverride} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="slug" value={a.slug} />
                <label className="sr-only" htmlFor={`st-${a.slug}`}>
                  מצב
                </label>
                <select id={`st-${a.slug}`} name="status" defaultValue={o?.status ?? "none"} className="field w-auto">
                  <option value="none">לפי הקובץ</option>
                  <option value="hidden">מוסתר (רק מנהלים)</option>
                  <option value="disabled">מושבת (לכולם)</option>
                </select>
                <label className="sr-only" htmlFor={`rs-${a.slug}`}>
                  סיבה
                </label>
                <input id={`rs-${a.slug}`} name="reason" defaultValue={o?.reason ?? ""} placeholder="סיבה (לא חובה)" className="field w-40" />
                <button className="btn-secondary" type="submit">
                  עדכון
                </button>
              </form>
            </div>
            {a.tier !== "external" && Object.keys(a.collections).length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-sm font-semibold">מנהלי האפליקציה</p>
                <p className="text-xs text-muted">רואים ומנהלים את כל הרשומות של האפליקציה בכל הגדוד (בלי הרשאות ניהול לאתר).</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {managers
                    .filter((m) => m.app_slug === a.slug)
                    .map((m) => (
                      <li key={m.profile_id}>
                        <form action={A.removeAppManager} className="chip flex items-center gap-1.5">
                          <input type="hidden" name="slug" value={a.slug} />
                          <input type="hidden" name="user" value={m.profile_id} />
                          {m.full_name ?? "ללא שם"}
                          <button type="submit" className="text-muted hover:text-danger" aria-label={`הסרת ${m.full_name ?? ""} ממנהלי האפליקציה`}>
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
                <form action={A.addAppManager} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="slug" value={a.slug} />
                  <label className="sr-only" htmlFor={`mg-${a.slug}`}>
                    הוספת מנהל/ת
                  </label>
                  <select id={`mg-${a.slug}`} name="user" defaultValue="" className="field w-auto max-w-full">
                    <option value="" disabled>
                      בחירת משתמש…
                    </option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? p.email}
                      </option>
                    ))}
                  </select>
                  <button className="btn-secondary" type="submit">
                    <Plus className="size-4" aria-hidden="true" /> הוספה
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

async function AuditTab({ db }: { db: Awaited<ReturnType<typeof getDb>> }) {
  const { rows } = await db.query<{ id: number; at: Date; action: string; target: string | null; details: unknown; actor: string | null; target_name: string | null }>(
    `select a.id, a.at, a.action, a.target, a.details, p.full_name as actor, t.full_name as target_name
       from public.audit_log a
       left join public.profiles p on p.id = a.actor_id
       left join public.profiles t on t.id::text = a.target
      order by a.at desc limit 300`,
  );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-start text-muted">
          <tr>
            <th className="p-2 text-start">מתי</th>
            <th className="p-2 text-start">מי</th>
            <th className="p-2 text-start">פעולה</th>
            <th className="p-2 text-start">על</th>
            <th className="p-2 text-start">פרטים</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="whitespace-nowrap p-2">{fmt(r.at)}</td>
              <td className="p-2">{r.actor ?? "—"}</td>
              <td className="p-2" dir="ltr">
                {r.action}
              </td>
              <td className="p-2">{r.target_name ?? r.target ?? "—"}</td>
              <td className="max-w-xs truncate p-2 text-muted" dir="ltr">
                {r.details ? JSON.stringify(r.details) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="text-muted">היומן ריק.</p> : null}
    </div>
  );
}
