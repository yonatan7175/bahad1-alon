import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleCheck, CircleX, GlobeLock, KeyRound, Rocket, ScrollText, Send, ShieldCheck, Stamp, UserRound } from "lucide-react";
import { getSession } from "@/platform/auth/session";
import { PortalHeader } from "@/components/portal-header";
import { Emblem, Ribbon, SchoolBadge } from "@/components/brand";
import { KabamStamp } from "@/components/kabam-stamp";

// דבר הקב״מית — the battalion security officer's guidelines for the site. Public (linked from the
// "אושר קב״ם" stamp on the sign-in page), so people read it BEFORE they register.
export const metadata: Metadata = {
  title: "דבר הקב״מית",
  description: "הנחיות אבטחת המידע של קב״מית הגדוד לשימוש באתר: הרשמה לבעלי סיווג 1 והוספת אתרים.",
};

const UPDATED = "23.11.2026";

export default async function KabamPage() {
  const session = await getSession();
  const approved = session?.profile.status === "approved" ? session : null;
  const back = approved ? { href: "/", label: "לדף הבית" } : session ? { href: "/onboarding", label: "חזרה להרשמה" } : { href: "/signin", label: "חזרה להתחברות" };

  return (
    <>
      {approved ? <PortalHeader session={approved} /> : null}
      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="hero">
          <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:pb-24 sm:pt-8">
            <Link
              href={back.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-[var(--hero-text)]/80 transition-colors hover:text-[var(--hero-text)]"
            >
              <ArrowRight className="size-4" aria-hidden="true" /> {back.label}
            </Link>

            <div className="mt-4 flex items-start justify-between gap-4">
              <div className="min-w-0 animate-rise">
                <div className="flex flex-wrap items-center gap-2">
                  {!approved ? <Emblem size={34} /> : null}
                  <SchoolBadge />
                </div>
                <p className="mt-5 text-[13px] font-bold text-[var(--hero-gold)]/90">אבטחת מידע · הנחיות מחייבות</p>
                <h1 className="mt-1.5 text-[44px] font-black leading-[1.05] tracking-tight text-[var(--hero-gold)] sm:text-6xl">דבר הקב״מית</h1>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--hero-text)]/85 sm:text-base">
                  ההנחיות של קב״מית הגדוד לשימוש באתר. כדאי לקרוא <b className="text-[var(--hero-text)]">לפני ההרשמה</b> ו<b className="text-[var(--hero-text)]">לפני שמציעים אתר</b> חדש.
                </p>
              </div>
              <KabamStamp id="kabam-hero" size={132} animate className="absolute end-3 top-16 w-[92px] shrink-0 [--stamp-ink:#ff8193] [--stamp-blend:normal] sm:static sm:mt-10 sm:w-[132px] [&_svg]:h-auto [&_svg]:w-full" />
            </div>

            <ul className="mt-6 flex flex-wrap gap-2 text-[12px] font-semibold text-[var(--hero-text)]/85">
              <HeroChip icon={<ScrollText aria-hidden="true" />}>2 הנחיות</HeroChip>
              <HeroChip icon={<BadgeCheck aria-hidden="true" />}>בתוקף מ־{UPDATED}</HeroChip>
              <HeroChip icon={<ShieldCheck aria-hidden="true" />}>חל על כל משתמשי האתר</HeroChip>
            </ul>
          </div>
          <Ribbon className="absolute inset-x-0 bottom-0" />
        </section>

        {/* ── The document ─────────────────────────────────────── */}
        <div className="relative mx-auto -mt-12 w-full max-w-3xl px-4 pb-10">
          <article className="animate-rise overflow-hidden rounded-[22px] border border-line bg-surface shadow-lift">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-5 py-3 sm:px-8">
              <p className="flex items-center gap-2 text-xs font-bold text-muted">
                <Stamp className="size-4 text-[var(--brand-red)]" aria-hidden="true" /> מסמך הנחיות · אבטחת מידע
              </p>
              <p className="text-xs font-semibold text-subtle">עודכן {UPDATED}</p>
            </header>

            <nav aria-label="תוכן העניינים" className="border-b border-line px-5 py-4 sm:px-8">
              <ol className="grid gap-2 sm:grid-cols-2">
                <TocItem href="#registration" n="01" title="הרשמה לבעלי סיווג 1" />
                <TocItem href="#sites" n="02" title="הוספת אתרים לאתר" />
              </ol>
            </nav>

            {/* 01 — registration */}
            <Directive
              id="registration"
              n="01"
              kicker="הרשמה"
              title={
                <>
                  בעלי סיווג 1 נרשמים עם <Mark>שם פרטי בלבד</Mark> — ולא דרך Google
                </>
              }
            >
              <p className="text-[15px] leading-relaxed text-muted sm:text-base">
                מי שבעל/ת <b className="text-fg">סיווג 1</b> נרשם/ת לאתר <b className="text-fg">עם שם משתמש וסיסמה</b>, ולא דרך ההתחברות של Google. בטופס הפרטים ממלאים{" "}
                <b className="text-fg">שם פרטי בלבד</b>.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <RuleList
                  tone="do"
                  title="עושים"
                  items={[
                    <>
                      בדף ההתחברות בוחרים <b>&quot;משתמש חדש&quot;</b> ובוחרים שם משתמש וסיסמה
                    </>,
                    <>
                      בשדה השם ממלאים <b>שם פרטי בלבד</b>
                    </>,
                    <>משלימים את שאר הפרטים (פלוגה, צוות, חדר) כרגיל</>,
                  ]}
                />
                <RuleList
                  tone="dont"
                  title="לא עושים"
                  items={[
                    <>
                      לא נכנסים עם <b>חשבון Google</b>
                    </>,
                    <>
                      לא ממלאים <b>שם משפחה</b>
                    </>,
                    <>
                      לא משתמשים ב<b>סיסמה של צה״ל</b> או של חשבון אחר
                    </>,
                  ]}
                />
              </div>

              {!session ? (
                <Link href="/signin?mode=register" className="btn mt-6 h-12 w-full gap-2 sm:w-auto sm:px-6">
                  <UserRound className="size-4" aria-hidden="true" /> להרשמה עם שם משתמש וסיסמה
                </Link>
              ) : null}
            </Directive>

            <Divider />

            {/* 02 — websites */}
            <Directive
              id="sites"
              n="02"
              kicker="הוספת אתרים"
              title={
                <>
                  כל אתר <Mark>יורש את ההתחברות</Mark> של האתר שלנו ועובר אישור קב״מית
                </>
              }
            >
              <p className="text-[15px] leading-relaxed text-muted sm:text-base">אתר שמציעים להוסיף לאתר כאפליקציה חייב לעמוד בשני תנאים:</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Requirement icon={<KeyRound aria-hidden="true" />} title="התחברות דרך האתר שלנו">
                  האתר יורש את ה-login של האתר שלנו — <b className="text-fg">בלי מערכת התחברות נפרדת</b> משלו.
                </Requirement>
                <Requirement icon={<GlobeLock aria-hidden="true" />} title="אישור קב״מית בנפרד">
                  לפני שהאתר עולה כאפליקציה הוא עובר <b className="text-fg">אישור של הקב״מית</b> — בנפרד מאישור מנהל האתר.
                </Requirement>
              </div>

              <h3 className="mt-7 text-[13px] font-bold text-subtle">הדרך של אתר חדש</h3>
              <ol className="mt-3 grid gap-0 sm:grid-cols-4 sm:gap-2">
                <Step n={1} icon={<Send aria-hidden="true" />} title="הגשת הצעה" text="בדף ״הוספת אפליקציה״" />
                <Step n={2} icon={<Stamp aria-hidden="true" />} title="אישור קב״מית" text="בדיקת אבטחת מידע" highlight />
                <Step n={3} icon={<ShieldCheck aria-hidden="true" />} title="אישור מנהל האתר" text="בדיקה טכנית" />
                <Step n={4} icon={<Rocket aria-hidden="true" />} title="עולה כאפליקציה" text="אריח בדף הבית" last />
              </ol>

              {approved ? (
                <Link href="/a/add-app" className="btn-secondary mt-6 h-12 w-full gap-2 sm:w-auto sm:px-6">
                  <Send className="size-4" aria-hidden="true" /> להצעת אתר
                </Link>
              ) : null}
            </Directive>

            {/* Signature */}
            <footer className="relative flex items-end justify-between gap-4 border-t border-line bg-surface-2/40 px-5 py-6 sm:px-8">
              <div>
                <p className="text-sm text-muted">בברכה,</p>
                <p className="mt-1 text-xl font-black tracking-tight">קב״מית גדוד אלון</p>
                <p className="mt-0.5 text-xs font-semibold text-subtle">קצינת ביטחון מידע · {UPDATED}</p>
              </div>
              <KabamStamp id="kabam-sign" size={92} className="-mb-2 -me-1 rotate-[6deg]" />
            </footer>
          </article>

          <p className="mt-5 flex items-start gap-2 px-1 text-[13px] leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              יש שאלה? פונים ישירות לקב״מית הגדוד. <b className="text-fg">אין לשלוח מידע מסווג דרך האתר</b> — גם לא בפניות.
            </span>
          </p>
        </div>
      </main>
    </>
  );
}

function HeroChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 backdrop-blur-sm [&_svg]:size-3.5 [&_svg]:text-[var(--hero-gold)]">
      {icon}
      {children}
    </li>
  );
}

function TocItem({ href, n, title }: { href: string; n: string; title: string }) {
  return (
    <li>
      <a href={href} className="group flex min-h-11 items-center gap-3 rounded-ctl px-2 transition-colors hover:bg-surface-2">
        <span className="font-mono text-xs font-bold text-[var(--brand-red)] tabular-nums" dir="ltr">
          {n}
        </span>
        <span className="text-sm font-semibold">{title}</span>
        <span className="ms-auto text-subtle transition-transform group-hover:-translate-x-0.5" aria-hidden="true">
          ←
        </span>
      </a>
    </li>
  );
}

function Directive({ id, n, kicker, title, children }: { id: string; n: string; kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative scroll-mt-24 px-5 py-7 sm:px-8 sm:py-9">
      <span
        className="pointer-events-none absolute end-4 top-3 select-none font-black leading-none text-[var(--brand-red)] opacity-[0.05] sm:end-7 sm:top-4"
        style={{ fontSize: 104 }}
        dir="ltr"
        aria-hidden="true"
      >
        {n}
      </span>
      <p className="flex items-center gap-2 text-[13px] font-bold text-[var(--brand-red)]">
        <span className="h-px w-6 bg-[var(--brand-red)]/60" aria-hidden="true" />
        הנחיה {n} · {kicker}
      </p>
      <h2 id={`${id}-title`} className="relative mt-2 max-w-xl text-[22px] font-extrabold leading-snug tracking-tight sm:text-[26px]">
        {title}
      </h2>
      <div className="relative mt-3">{children}</div>
    </section>
  );
}

/** Highlighter stroke behind a key phrase. */
function Mark({ children }: { children: ReactNode }) {
  return <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--hero-gold)_45%,transparent)_62%)] px-0.5">{children}</span>;
}

function RuleList({ tone, title, items }: { tone: "do" | "dont"; title: string; items: ReactNode[] }) {
  const doIt = tone === "do";
  const Icon = doIt ? CircleCheck : CircleX;
  return (
    <div className={`rounded-2xl border p-4 ${doIt ? "border-success/25 bg-success-soft/50" : "border-danger/25 bg-danger-soft/50"}`}>
      <p className={`flex items-center gap-2 text-sm font-extrabold ${doIt ? "text-success" : "text-danger"}`}>
        <Icon className="size-[18px]" aria-hidden="true" /> {title}
      </p>
      <ul className="mt-2.5 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
            <span className={`mt-[9px] size-1.5 shrink-0 rounded-full ${doIt ? "bg-success" : "bg-danger"}`} aria-hidden="true" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Requirement({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-[var(--shadow-sm)]">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>
      <p className="mt-3 font-extrabold">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Step({ n, icon, title, text, highlight = false, last = false }: { n: number; icon: ReactNode; title: string; text: string; highlight?: boolean; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-4 sm:flex-col sm:gap-2 sm:pb-0">
      {/* connector: vertical on phones, horizontal from sm */}
      {!last ? (
        <span className="absolute start-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-line-strong sm:start-12 sm:top-5 sm:h-px sm:w-[calc(100%-2.5rem)]" aria-hidden="true" />
      ) : null}
      <span
        className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 [&_svg]:size-[18px] ${
          highlight ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-white shadow-[0_6px_18px_-6px_var(--brand-red)]" : "border-line-strong bg-surface text-muted"
        }`}
      >
        {icon}
        <span className="sr-only">שלב {n}</span>
      </span>
      <span className="pt-1 sm:pt-0">
        <span className={`block text-sm font-extrabold ${highlight ? "text-[var(--brand-red)]" : ""}`}>{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </li>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 px-5 sm:px-8" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="size-1.5 rotate-45 bg-[var(--hero-gold)]" />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
