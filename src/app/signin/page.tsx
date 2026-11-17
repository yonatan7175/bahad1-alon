import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, FlaskConical, LockKeyhole, UserPlus } from "lucide-react";
import { getSession, safeNext } from "@/platform/auth/session";
import { authMode } from "@/platform/server/config";
import { ROLE_LABEL, STATUS_LABEL } from "@/lib/site";
import { AuthShell } from "@/components/auth-shell";
import { Avatar } from "@/components/avatar";
import { GoogleSignInButton } from "./google-button";

export const metadata: Metadata = { title: "התחברות" };

export default async function SignIn(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/");
  const s = await getSession();
  if (s?.profile.status === "approved") redirect(next);
  if (s) redirect(s.profile.status === "blocked" ? "/blocked" : s.profile.onboarded_at ? "/pending" : "/onboarding");
  const mode = authMode();

  return (
    <AuthShell>
      <h1 className="text-center text-2xl font-extrabold">ברוכים הבאים</h1>
      <p className="mt-2 text-center text-muted">כל הכלים של הגדוד במקום אחד. מתחברים עם Google, ומנהל מאשר את הכניסה.</p>
      {sp.error ? (
        <p className="mt-4 flex items-center gap-2 rounded-ctl bg-danger-soft p-3 text-sm text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" /> ההתחברות נכשלה. נסו שוב.
        </p>
      ) : null}
      <div className="mt-6">{mode === "mock" ? <MockSignIn next={next} /> : <GoogleSignInButton next={next} direct={mode === "google"} />}</div>
      <p className="mt-6 flex items-start gap-2 rounded-ctl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        האתר לעולם לא יבקש שם משתמש או סיסמה של צה&quot;ל. זהו כלי לא רשמי שנבנה ע&quot;י חניכים.
      </p>
    </AuthShell>
  );
}

async function MockSignIn({ next }: { next: string }) {
  const { ensureDevSeed, listMockUsers } = await import("@/platform/auth/mock");
  const { getDb } = await import("@/platform/server/db");
  await ensureDevSeed();
  const users = await listMockUsers(await getDb());
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 rounded-ctl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
        <FlaskConical className="size-4" aria-hidden="true" /> מצב פיתוח — בחרו משתמש לדוגמה
      </p>
      <ul className="list-group">
        {users.map((u) => (
          <li key={u.id}>
            <form action="/auth/mock" method="post">
              <input type="hidden" name="action" value="login" />
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="list-row w-full text-start transition-colors hover:bg-surface-2" data-testid={`mock-login-${u.email}`}>
                <Avatar name={u.full_name ?? u.email} url={null} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.full_name ?? u.email}</span>
                  <span className="block truncate text-xs text-muted" dir="ltr">
                    {u.email}
                  </span>
                </span>
                <span className={u.status === "approved" ? "badge-accent" : u.status === "pending" ? "badge-warning" : "badge-danger"}>
                  {u.status === "approved" ? ROLE_LABEL[u.role] : STATUS_LABEL[u.status]}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <details className="group mt-4 rounded-card border border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold">
          <UserPlus className="size-4 text-muted" aria-hidden="true" /> הדמיית כניסה ראשונה (משתמש חדש)
        </summary>
        <form action="/auth/mock" method="post" className="border-t border-line p-4">
          <input type="hidden" name="action" value="create" />
          <input type="hidden" name="next" value={next} />
          <label className="label mt-0" htmlFor="mock-name">
            שם (כמו ב-Google)
          </label>
          <input id="mock-name" name="name" required maxLength={60} className="field" />
          <label className="label" htmlFor="mock-email">
            אימייל
          </label>
          <input id="mock-email" name="email" type="email" required maxLength={120} className="field" dir="ltr" />
          <button type="submit" className="btn mt-4 w-full">
            כניסה כמשתמש חדש
          </button>
        </form>
      </details>
    </div>
  );
}
