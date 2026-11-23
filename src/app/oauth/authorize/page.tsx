import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, Contact, IdCard, ShieldCheck, UsersRound } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { ConnectError, hasConsent, issueCode, siteLive, validateAuthorize, type AuthorizeRequest } from "@/platform/auth/connect";
import { AuthShell } from "@/components/auth-shell";
import { ConsentButtons } from "./consent";

// "התחברות עם צ1" step 1 (OAuth authorize). Signed-in + approved users only (the proxy sends others to
// /signin and back here). First time per site: a consent screen; afterwards straight back to the site.
export const metadata: Metadata = { title: "התחברות לאתר" };
export const dynamic = "force-dynamic";

const PARAMS = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method"] as const;

export default async function Authorize(props: PageProps<"/oauth/authorize">) {
  const sp = await props.searchParams;
  const q: Record<string, string> = {};
  for (const k of PARAMS) if (typeof sp[k] === "string") q[k] = sp[k];
  const session = await requireApproved(`/oauth/authorize?${new URLSearchParams(q)}`);
  const db = await getDb();
  let req: AuthorizeRequest;
  try {
    req = await validateAuthorize(db, q, session.profile.id);
  } catch (e) {
    if (!(e instanceof ConnectError)) throw e;
    return (
      <AuthShell>
        <p className="flex items-center gap-2 text-lg font-extrabold text-danger">
          <CircleAlert className="size-5" aria-hidden="true" /> אי אפשר להתחבר לאתר
        </p>
        <p className="mt-2 text-muted">{e.message}</p>
        <Link href="/" className="btn-secondary mt-6 w-full">
          לדף הבית
        </Link>
      </AuthShell>
    );
  }
  // Already approved this site (with everything it gets now): straight back, no screen.
  if (await hasConsent(db, req.site.id, session.profile.id, req.site.directory_allowed)) {
    redirect(await issueCode(db, req, session.profile.id));
  }

  const host = new URL(req.site.url).host;
  const p = session.profile;
  return (
    <AuthShell>
      <div className="flex items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-2 text-3xl">
          {req.site.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- validated data: URL icon
            <img src={req.site.icon} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden="true">{req.site.emoji}</span>
          )}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{req.site.name}</h1>
          <p className="truncate text-sm text-muted" dir="ltr">
            {host}
          </p>
        </div>
      </div>
      <p className="mt-5 text-[15px] leading-relaxed">
        האתר רוצה להתחבר עם החשבון שלך ב<b>צ1</b>. הוא יקבל:
      </p>
      <ul className="mt-3 space-y-2.5">
        <Item icon={<IdCard aria-hidden="true" />} title="הפרטים שלך">
          {p.full_name}, תפקיד, פלוגה, צוות וחדר
        </Item>
        <Item icon={<Contact aria-hidden="true" />} title="טלפון ואימייל">
          רק אם בחרת להציג אותם (פרופיל ← פרטיות)
        </Item>
        {req.site.directory_allowed ? (
          <Item icon={<UsersRound aria-hidden="true" />} title="רשימת אנשי הגדוד">
            כמו בדף &quot;אנשים&quot; — שמות, תפקידים, פלוגה וצוות
          </Item>
        ) : null}
      </ul>
      <p className="mt-4 flex items-start gap-2 rounded-ctl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <ShieldCheck className={`mt-0.5 size-4 shrink-0 ${siteLive(req.site) ? "text-success" : "text-warning"}`} aria-hidden="true" />
        {siteLive(req.site)
          ? "האתר אושר ע״י הקב״מית ומנהל האתר. הוא לא יכול לשנות שום דבר בצ1, ואפשר לנתק אותו בכל רגע מהפרופיל."
          : "האתר עדיין ממתין לאישור — רק את/ה (כמי שהציע אותו) יכול/ה להתחבר אליו כדי לבדוק אותו."}
      </p>
      <ConsentButtons params={q} />
    </AuthShell>
  );
}

function Item({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-[18px]">{icon}</span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
    </li>
  );
}
