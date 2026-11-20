// הוספת אפליקציה — suggest a website (shown as a link tile on the home page after an admin approves)
// or a GitHub repository (after approval it is only saved in a list the admin sees).
import Link from "next/link";
import { Check, CircleAlert, ExternalLink, FolderGit2, Globe, Inbox, Send, Trash2, X } from "lucide-react";
import { AppPage } from "@/components/app-page";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { mySubmissions, submissionsByStatus, type Submission } from "@/platform/server/submissions";
import { MAX_PENDING_PER_USER } from "@/lib/submissions";
import { IconPicker } from "./icon-picker";
import { removeSubmission, reviewSubmission, submitApp, withdrawSubmission } from "./actions";

export const metadata = { title: "הוספת אפליקציה" };

const STATUS: Record<Submission["status"], { label: string; cls: string }> = {
  pending: { label: "ממתין לאישור", cls: "badge-warning" },
  approved: { label: "אושר", cls: "badge-accent" },
  rejected: { label: "נדחה", cls: "badge-danger" },
};
const date = (d: Date) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(new Date(d));

function Kind({ s }: { s: Submission }) {
  return s.kind === "github" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-muted">
      <FolderGit2 className="size-3" aria-hidden="true" /> GitHub
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-muted">
      <Globe className="size-3" aria-hidden="true" /> אתר
    </span>
  );
}

function Row({ s, children, who = false }: { s: Submission; children?: React.ReactNode; who?: boolean }) {
  return (
    <li className="rounded-ctl border border-line bg-surface p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-ctl bg-surface-2 text-2xl" aria-hidden="true">
          {s.kind === "github" ? (
            <FolderGit2 className="size-5" />
          ) : s.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded icon (validated data URL)
            <img src={s.icon} alt="" className="size-full object-cover" />
          ) : (
            s.emoji
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-bold">{s.name}</p>
            <Kind s={s} />
            <span className={STATUS[s.status].cls}>{STATUS[s.status].label}</span>
          </div>
          {s.description ? <p className="mt-0.5 text-sm">{s.description}</p> : null}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 break-all text-sm font-medium text-accent hover:underline" dir="ltr">
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            {s.url}
          </a>
          <p className="mt-1 text-xs text-muted">
            {who ? `${s.submitter_name ?? "משתמש שנמחק"} · ` : ""}
            {date(s.created_at)}
            {s.reviewed_at ? ` · ${s.status === "approved" ? "אושר" : "נדחה"} ${s.reviewer_name ? `ע״י ${s.reviewer_name}` : ""} ${date(s.reviewed_at)}` : ""}
          </p>
          {s.review_note ? <p className="mt-2 rounded-ctl bg-surface-2 px-3 py-2 text-sm">הערת מנהל: {s.review_note}</p> : null}
        </div>
      </div>
      {children}
    </li>
  );
}

function Section({ title, icon, count, children, empty }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        {icon} {title} <span className="text-muted">· {count}</span>
      </h2>
      {count ? <ul className="mt-3 space-y-2">{children}</ul> : <p className="mt-3 rounded-ctl border border-dashed border-line p-4 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}

export default async function Page(props: PageProps<"/a/add-app">) {
  const { profile } = await requireApproved("/a/add-app");
  const sp = await props.searchParams;
  const kind = sp.kind === "github" ? "github" : "url";
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = await getDb();
  const isAdmin = profile.role === "admin";
  const [mine, pending, sites, repos] = await Promise.all([
    mySubmissions(db, profile.id),
    isAdmin ? submissionsByStatus(db, "pending") : Promise.resolve([]),
    isAdmin ? submissionsByStatus(db, "approved", "url") : Promise.resolve([]),
    isAdmin ? submissionsByStatus(db, "approved", "github") : Promise.resolve([]),
  ]);

  return (
    <AppPage slug="add-app" tier="full">
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-12 pt-4">
        <header className="relative overflow-hidden rounded-card bg-[image:var(--hero)] p-5 text-[color:var(--hero-text)] shadow-[var(--shadow-lg)]">
          <h1 className="text-2xl font-black">הוספת אפליקציה</h1>
          <p className="mt-1 text-sm opacity-90">
            מכירים אתר שימושי לגדוד? הציעו אותו כאן. מנהל האתר בודק כל הצעה — אחרי אישור, אתר יופיע בדף הבית לכולם.
          </p>
          <span className="pointer-events-none absolute -bottom-6 -start-3 text-[110px] leading-none opacity-10" aria-hidden="true">
            ➕
          </span>
        </header>

        {ok ? (
          <p role="status" className="flex items-center gap-2 rounded-ctl border border-success/30 bg-success-soft px-3 py-2.5 text-sm font-semibold text-success">
            <Check className="size-4 shrink-0" aria-hidden="true" /> {ok}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center gap-2 rounded-ctl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" /> {error}
          </p>
        ) : null}

        <section className="card p-4">
          <div className="grid grid-cols-2 gap-1 rounded-card bg-surface-2 p-1" role="tablist" aria-label="סוג ההצעה">
            {(
              [
                ["url", "אתר (קישור)", Globe],
                ["github", "מאגר GitHub", FolderGit2],
              ] as const
            ).map(([k, label, Icon]) => (
              <Link
                key={k}
                href={k === "github" ? "/a/add-app?kind=github" : "/a/add-app"}
                role="tab"
                aria-selected={kind === k}
                scroll={false}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-ctl text-sm font-bold transition-all ${
                  kind === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
                }`}
              >
                <Icon className="size-[18px]" aria-hidden="true" /> {label}
              </Link>
            ))}
          </div>

          <form action={submitApp} className="mt-4 space-y-3" key={kind}>
            <input type="hidden" name="kind" value={kind} />
            <p className="text-sm text-muted">
              {kind === "url"
                ? "כתובת של אתר (https). אחרי אישור — אריח חדש בדף הבית שפותח את האתר בלשונית חדשה."
                : "קישור למאגר ב-GitHub. אחרי אישור הקישור נשמר ברשימה שמנהל האתר רואה (שום קוד לא מורץ)."}
            </p>
            <div>
              <label className="label" htmlFor="url">
                {kind === "url" ? "כתובת האתר" : "קישור למאגר"}
              </label>
              <input
                id="url"
                name="url"
                className="field"
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                required
                maxLength={300}
                placeholder={kind === "url" ? "https://example.com" : "https://github.com/owner/repo"}
              />
            </div>
            <div>
              <label className="label" htmlFor="name">
                שם {kind === "github" ? "(לא חובה — ברירת מחדל: שם המאגר)" : ""}
              </label>
              <input id="name" name="name" className="field" maxLength={30} minLength={kind === "url" ? 2 : undefined} required={kind === "url"} placeholder={kind === "url" ? "למשל: מחשבון כושר" : ""} />
            </div>
            <div>
              <label className="label" htmlFor="description">
                תיאור קצר (לא חובה)
              </label>
              <input id="description" name="description" className="field" maxLength={120} placeholder="מה זה ולמה זה שימושי לגדוד" />
            </div>
            {kind === "url" ? <IconPicker /> : null}
            <p className="rounded-ctl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
              אסור להציע אתרים עם מידע מסווג, מידע אישי, או אתר שמתחזה למערכת רשמית של צה&quot;ל.
            </p>
            <button type="submit" className="btn min-h-12 w-full">
              <Send className="size-4" aria-hidden="true" /> שליחה לאישור מנהל
            </button>
            <p className="text-center text-xs text-muted">עד {MAX_PENDING_PER_USER} הצעות ממתינות לכל משתמש</p>
          </form>
        </section>

        <Section title="ההצעות שלי" icon={<Inbox className="size-5 text-accent" aria-hidden="true" />} count={mine.length} empty="עוד לא הצעת אפליקציות.">
          {mine.map((s) => (
            <Row key={s.id} s={s}>
              {s.status === "pending" ? (
                <form action={withdrawSubmission} className="mt-2 flex justify-end">
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="btn-ghost min-h-11 text-sm">
                    <Trash2 className="size-4" aria-hidden="true" /> ביטול ההצעה
                  </button>
                </form>
              ) : null}
            </Row>
          ))}
        </Section>

        {isAdmin ? (
          <>
            <div className="flex items-center gap-2 pt-2">
              <span className="h-px flex-1 bg-line" />
              <span className="section-title">ניהול (מנהלי האתר בלבד)</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <Section title="ממתינות לאישור" icon={<Inbox className="size-5 text-gold" aria-hidden="true" />} count={pending.length} empty="אין הצעות שממתינות 🎉">
              {pending.map((s) => (
                <Row key={s.id} s={s} who>
                  <form action={reviewSubmission} className="mt-3 space-y-2 border-t border-line pt-3">
                    <input type="hidden" name="id" value={s.id} />
                    <label className="sr-only" htmlFor={`note-${s.id}`}>
                      הערה למציע
                    </label>
                    <input id={`note-${s.id}`} name="note" className="field" maxLength={200} placeholder="הערה למציע (לא חובה)" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="submit" name="decision" value="approve" className="btn min-h-11">
                        <Check className="size-4" aria-hidden="true" /> {s.kind === "url" ? "אישור — הוספה לאתר" : "אישור — שמירה ברשימה"}
                      </button>
                      <button type="submit" name="decision" value="reject" className="btn-secondary min-h-11">
                        <X className="size-4" aria-hidden="true" /> דחייה
                      </button>
                    </div>
                  </form>
                </Row>
              ))}
            </Section>

            <Section title="אתרים באתר (בדף הבית)" icon={<Globe className="size-5 text-accent" aria-hidden="true" />} count={sites.length} empty="עוד לא אושרו אתרים.">
              {sites.map((s) => (
                <Row key={s.id} s={s} who>
                  <form action={removeSubmission} className="mt-2 flex justify-end">
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="btn-ghost min-h-11 text-sm text-danger">
                      <Trash2 className="size-4" aria-hidden="true" /> הסרה מדף הבית
                    </button>
                  </form>
                </Row>
              ))}
            </Section>

            <Section title="מאגרי GitHub שאושרו" icon={<FolderGit2 className="size-5 text-accent" aria-hidden="true" />} count={repos.length} empty="עוד לא אושרו מאגרים.">
              {repos.map((s) => (
                <Row key={s.id} s={s} who>
                  <form action={removeSubmission} className="mt-2 flex justify-end">
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="btn-ghost min-h-11 text-sm text-danger">
                      <Trash2 className="size-4" aria-hidden="true" /> הסרה מהרשימה
                    </button>
                  </form>
                </Row>
              ))}
            </Section>
          </>
        ) : null}
      </main>
    </AppPage>
  );
}
