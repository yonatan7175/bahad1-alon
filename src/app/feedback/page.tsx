import type { Metadata } from "next";
import Link from "next/link";
import { Bug, Check, CircleAlert, Inbox, Lightbulb, MessageSquareWarning, MessagesSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { allFeedback, myFeedback, type Feedback, type FeedbackKind } from "@/platform/server/feedback";
import { PortalHeader } from "@/components/portal-header";
import { deleteFeedback, handleFeedback, sendFeedback, withdrawFeedback } from "./actions";

export const metadata: Metadata = { title: "שינויים ושיפורים" };

const KIND: Record<FeedbackKind, { label: string; icon: typeof Lightbulb; cls: string }> = {
  idea: { label: "רעיון / הצעה", icon: Lightbulb, cls: "bg-gold-soft text-gold" },
  bug: { label: "משהו לא עובד", icon: Bug, cls: "bg-danger-soft text-danger" },
  complaint: { label: "טענה / תלונה", icon: MessageSquareWarning, cls: "bg-warning-soft text-warning" },
  other: { label: "אחר", icon: MessagesSquare, cls: "bg-accent-soft text-accent" },
};
const when = (d: Date) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date(d));

function Item({ f, admin = false, view, children }: { f: Feedback; admin?: boolean; view?: string; children?: React.ReactNode }) {
  const k = KIND[f.kind];
  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-ctl ${k.cls}`} aria-hidden="true">
          <k.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-bold">{k.label}</p>
            <span className={f.status === "done" ? "badge-accent" : "badge-warning"}>{f.status === "done" ? "טופל" : "פתוח"}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {admin ? `${f.author_name ?? "משתמש שנמחק"}${f.author_unit ? ` · ${f.author_unit}` : ""} · ` : ""}
            {when(f.created_at)}
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{f.body}</p>
      {f.reply ? (
        <p className="mt-3 rounded-ctl bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          <span className="font-bold">מנהל האתר{f.handler_name ? ` (${f.handler_name})` : ""}: </span>
          {f.reply}
        </p>
      ) : null}
      {admin ? (
        <form action={handleFeedback} className="mt-3 space-y-2 border-t border-line pt-3">
          <input type="hidden" name="id" value={f.id} />
          {view ? <input type="hidden" name="view" value={view} /> : null}
          <label className="sr-only" htmlFor={`reply-${f.id}`}>
            תשובה לשולח/ת
          </label>
          <input id={`reply-${f.id}`} name="reply" className="field" maxLength={500} defaultValue={f.reply ?? ""} placeholder="תשובה לשולח/ת (לא חובה)" />
          <div className="flex flex-wrap gap-2">
            {f.status === "open" ? (
              <button type="submit" name="decision" value="done" className="btn min-h-11 flex-1">
                <Check className="size-4" aria-hidden="true" /> טופל
              </button>
            ) : (
              <button type="submit" name="decision" value="reopen" className="btn-secondary min-h-11 flex-1">
                <RotateCcw className="size-4" aria-hidden="true" /> פתיחה מחדש
              </button>
            )}
            <button type="submit" name="decision" value="reply" className="btn-secondary min-h-11">
              <Send className="size-4" aria-hidden="true" /> שמירת תשובה
            </button>
            <button type="submit" formAction={deleteFeedback} className="btn-ghost min-h-11 text-danger" aria-label="מחיקה">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
      {children}
    </li>
  );
}

export default async function FeedbackPage(props: PageProps<"/feedback">) {
  const session = await requireApproved("/feedback");
  const p = session.profile;
  const isAdmin = p.role === "admin";
  const sp = await props.searchParams;
  const view = sp.view === "done" ? "done" : "open";
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = await getDb();
  const [mine, inbox] = await Promise.all([myFeedback(db, p.id), isAdmin ? allFeedback(db, view) : Promise.resolve([])]);

  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 pb-8 pt-4 sm:pt-6">
        <header className="hero rounded-[24px] p-5 shadow-lift sm:p-7">
          <p className="hero-gold text-xs font-bold tracking-wide">צ1 · מנהל האתר קורא הכול</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">שינויים ושיפורים</h1>
          <p className="mt-1.5 max-w-lg text-sm opacity-90">משהו לא עובד, חסר כלי, או שיש לך רעיון לשפר? כתבו כאן — זה מגיע ישירות למנהל האתר, והתשובה תופיע למטה.</p>
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

        <form action={sendFeedback} className="card space-y-4 p-4 sm:p-5">
          <fieldset>
            <legend className="label mt-0">על מה מדובר?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(KIND) as FeedbackKind[]).map((k, i) => {
                const K = KIND[k];
                return (
                  <label key={k} className="cursor-pointer">
                    <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
                    <span className="flex min-h-12 items-center justify-center gap-2 rounded-ctl border-2 border-line bg-surface px-2 text-sm font-bold transition-all peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                      <K.icon className="size-4" aria-hidden="true" /> {K.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="fb-body">
              מה תרצו להגיד?
            </label>
            <textarea
              id="fb-body"
              name="body"
              required
              minLength={3}
              maxLength={1500}
              className="field min-h-36"
              placeholder="למשל: באפליקציית הכביסה הייתי רוצה לראות גם את השבוע הבא · כפתור האישור היומי לא עובד לי בטלפון"
            />
          </div>
          <button type="submit" className="btn min-h-12 w-full">
            <Send className="size-4" aria-hidden="true" /> שליחה למנהל האתר
          </button>
        </form>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
            <Inbox className="size-5 text-accent" aria-hidden="true" /> מה ששלחתי <span className="text-muted">· {mine.length}</span>
          </h2>
          {mine.length ? (
            <ul className="space-y-2">
              {mine.map((f) => (
                <Item key={f.id} f={f}>
                  {f.status === "open" && !f.reply ? (
                    <form action={withdrawFeedback} className="mt-2 flex justify-end">
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className="btn-ghost min-h-11 text-sm text-muted">
                        <Trash2 className="size-4" aria-hidden="true" /> ביטול
                      </button>
                    </form>
                  ) : null}
                </Item>
              ))}
            </ul>
          ) : (
            <p className="rounded-ctl border border-dashed border-line p-4 text-center text-sm text-muted">עוד לא שלחת כלום.</p>
          )}
        </section>

        {isAdmin ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <span className="h-px flex-1 bg-line" />
              <span className="section-title">תיבת הפניות — מנהלי האתר</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-card bg-surface-2 p-1" role="tablist" aria-label="סינון">
              {(
                [
                  ["open", "פתוחות"],
                  ["done", "טופלו"],
                ] as const
              ).map(([k, label]) => (
                <Link
                  key={k}
                  href={k === "done" ? "/feedback?view=done" : "/feedback"}
                  role="tab"
                  aria-selected={view === k}
                  scroll={false}
                  className={`flex min-h-11 items-center justify-center rounded-ctl text-sm font-bold transition-all ${
                    view === k ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
            {inbox.length ? (
              <ul className="space-y-2">
                {inbox.map((f) => (
                  <Item key={f.id} f={f} admin view={view === "done" ? "done" : undefined} />
                ))}
              </ul>
            ) : (
              <p className="rounded-ctl border border-dashed border-line p-6 text-center text-sm text-muted">{view === "open" ? "אין פניות פתוחות 🎉" : "עוד אין פניות שטופלו."}</p>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
