import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CircleCheck,
  CircleX,
  Cloud,
  Code2,
  Globe,
  KeyRound,
  Laptop,
  MessageCircleQuestion,
  Rocket,
  Send,
  Sparkles,
  Stamp,
  Terminal,
  UsersRound,
} from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { PortalHeader } from "@/components/portal-header";
import { Ribbon } from "@/components/brand";
import { CopyPrompt } from "@/components/copy-prompt";
import { KabamStamp } from "@/components/kabam-stamp";
import { TEMPLATE_URL, connectPrompt } from "@/lib/connect-guide";

// "פיתוח אפליקציות" — for vibe coders: build a tool for the battalion with Claude Code, from an idea
// to a tile on the home page. Explanation + the starter prompt (src/lib/connect-guide.ts).
export const metadata: Metadata = {
  title: "פיתוח אפליקציות",
  description: "איך בונים אפליקציה לגדוד עם Claude Code — בלי ניסיון בתכנות. הסבר צעד אחרי צעד ופרומפט מוכן.",
};

const PORTAL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bahad1-alon.duckdns.org").replace(/\/$/, "");

export default async function DevelopPage() {
  const session = await requireApproved("/develop");
  return (
    <>
      <PortalHeader session={session} />
      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="hero">
          <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:pb-24 sm:pt-12">
            <p className="inline-flex animate-rise items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-[13px] font-bold text-[var(--hero-gold)]">
              <Sparkles className="size-3.5" aria-hidden="true" /> בלי ניסיון בתכנות
            </p>
            <h1 className="mt-4 animate-rise text-[40px] font-black leading-[1.08] tracking-tight text-[var(--hero-gold)] sm:text-6xl">
              בונים אפליקציה לגדוד
            </h1>
            <p className="mt-4 max-w-lg animate-rise text-[15px] leading-relaxed text-[var(--hero-text)]/85 sm:text-base">
              יש לך רעיון לכלי שיעזור לצוות, לפלוגה או לגדוד? מתארים אותו ל-<b className="text-[var(--hero-text)]">Claude</b> במילים
              פשוטות — והוא כותב את הקוד. בסוף האתר שלך מופיע כאן כאריח בדף הבית, והחברים נכנסים אליו עם החשבון שלהם בצ1.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <a href="#prompt" className="btn h-12 gap-2 px-5">
                <Bot className="size-4" aria-hidden="true" /> לפרומפט המוכן
              </a>
              <a href="#steps" className="inline-flex h-12 items-center gap-2 rounded-ctl border border-white/20 bg-white/[0.06] px-5 text-sm font-bold text-[var(--hero-text)] transition-colors hover:bg-white/[0.12]">
                איך זה עובד <ArrowLeft className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <Ribbon className="absolute inset-x-0 bottom-0" />
        </section>

        <div className="relative mx-auto -mt-12 w-full max-w-3xl space-y-5 px-4 pb-10">
          {/* ── What you need ── */}
          <section className="card animate-rise p-5 shadow-lift sm:p-6">
            <h2 className="text-xl font-extrabold">מה צריך</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              <Need icon={<Laptop aria-hidden="true" />} title="מחשב">
                Windows, Mac או Linux. מהטלפון זה לא עובד.
              </Need>
              <Need icon={<Bot aria-hidden="true" />} title="Claude Code">
                עוזר התכנות של Anthropic. דורש מנוי Claude (Pro ומעלה).
              </Need>
              <Need icon={<Cloud aria-hidden="true" />} title="חשבון GitHub">
                בחינם — שם האתר יעלה לאוויר (GitHub Pages).
              </Need>
            </ul>
          </section>

          {/* ── Steps ── */}
          <section id="steps" className="card scroll-mt-24 p-5 sm:p-6">
            <h2 className="text-xl font-extrabold">מהרעיון לאריח בדף הבית</h2>
            <p className="mt-1 text-sm text-muted">שבעה צעדים. את רוב העבודה Claude עושה.</p>
            <ol className="mt-5">
              <Step n={1} icon={<Terminal aria-hidden="true" />} title="מתקינים את Claude Code">
                <p>
                  פותחים טרמינל (ב-Windows: PowerShell) ומדביקים את פקודת ההתקנה מ-
                  <a href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline-offset-4 hover:underline">
                    claude.com/claude-code
                  </a>
                  . בפעם הראשונה מתחברים עם חשבון Claude.
                </p>
              </Step>
              <Step n={2} icon={<Code2 aria-hidden="true" />} title="פותחים תיקייה לאתר">
                <p>יוצרים תיקייה ריקה, נכנסים אליה בטרמינל ומפעילים את Claude:</p>
                <Cmd>{"mkdir my-site\ncd my-site\nclaude"}</Cmd>
              </Step>
              <Step n={3} icon={<Bot aria-hidden="true" />} title="מדביקים את הפרומפט ומתארים את הרעיון">
                <p>
                  מעתיקים את <a href="#prompt" className="font-semibold text-accent underline-offset-4 hover:underline">הפרומפט למטה</a> ומדביקים ב-Claude. הוא כבר יודע איך
                  מתחברים עם צ1 ומה החוקים. אחר כך הוא ישאל מה האתר צריך לעשות — עונים בעברית, במילים שלכם.
                </p>
                <Tip>אפשר לבקש שינויים כמה שרוצים: &quot;תגדיל את הכפתור&quot;, &quot;תוסיף חיפוש&quot;, &quot;משהו לא עובד, תתקן&quot;.</Tip>
              </Step>
              <Step n={4} icon={<Laptop aria-hidden="true" />} title="בודקים במחשב">
                <p>
                  מבקשים מ-Claude להריץ את האתר (או מריצים <code dir="ltr" className="rounded bg-surface-2 px-1">npx serve .</code>) ופותחים את הכתובת בדפדפן. במחשב האתר
                  עובד <b>במצב דמו</b>: משתמש לדוגמה ורשימת אנשים מזויפת — בלי שום רישום.
                </p>
              </Step>
              <Step n={5} icon={<Globe aria-hidden="true" />} title="מעלים לאוויר">
                <p>
                  אומרים ל-Claude: <b>&quot;תעזור לי להעלות את האתר ל-GitHub Pages&quot;</b>. הוא יסביר כל לחיצה. בסוף יש לאתר כתובת שמתחילה ב-
                  <code dir="ltr" className="rounded bg-surface-2 px-1">https://</code>.
                </p>
              </Step>
              <Step n={6} icon={<Send aria-hidden="true" />} title="מציעים אותו בצ1">
                <p>
                  ב-
                  <Link href="/a/add-app" className="font-semibold text-accent underline-offset-4 hover:underline">
                    הוספת אפליקציה
                  </Link>{" "}
                  ← <b>אתר</b> ← הכתובת ← מסמנים <b>&quot;האתר מתחבר עם צ1&quot;</b> (ואת &quot;רשימת אנשי הגדוד&quot; רק אם באמת צריך). עד האישור רק את/ה יכול/ה
                  להתחבר לאתר — בדיוק כדי לבדוק אותו בכתובת האמיתית.
                </p>
              </Step>
              <Step n={7} icon={<Rocket aria-hidden="true" />} title="אישור ועלייה" last>
                <p>הקב״מית בודקת ומאשרת, מנהל האתר מוסיף — והאתר מופיע כאריח בדף הבית לכל הגדוד. 🎉</p>
              </Step>
            </ol>
          </section>

          {/* ── The prompt ── */}
          <section id="prompt" className="card scroll-mt-24 border-accent/30 p-5 shadow-lift sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast">
                <Bot className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold">הפרומפט להתחלה</h2>
                <p className="mt-0.5 text-sm text-muted">מעתיקים, מדביקים ב-Claude Code, ומתחילים לספר לו מה בונים.</p>
              </div>
            </div>
            <CopyPrompt text={connectPrompt(PORTAL)} />
            <p className="mt-3 text-xs text-muted">
              הפרומפט באנגלית כי ככה Claude עובד הכי מדויק — את השיחה איתו אפשר לנהל בעברית. רוצים לראות דוגמה מוכנה?{" "}
              <a href={TEMPLATE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline-offset-4 hover:underline">
                תבנית לדוגמה ב-GitHub
              </a>
              .
            </p>
          </section>

          {/* ── What the site gets ── */}
          <section className="card p-5 sm:p-6">
            <h2 className="text-xl font-extrabold">מה האתר שלך מקבל מצ1</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Fact icon={<KeyRound aria-hidden="true" />} title="התחברות מוכנה">
                אין הרשמה וסיסמאות. המשתמשים נכנסים עם החשבון שלהם בצ1 בלחיצה.
              </Fact>
              <Fact icon={<UsersRound aria-hidden="true" />} title="מי המשתמש">
                שם, תפקיד, פלוגה, צוות וחדר. רשימת אנשי הגדוד — רק באישור הקב״מית.
              </Fact>
              <Fact icon={<Cloud aria-hidden="true" />} title="הנתונים שלך">
                אם האתר שומר מידע — הוא נשמר אצלו (Claude יעזור להקים, למשל Supabase בחינם).
              </Fact>
            </div>
          </section>

          {/* ── Ideas ── */}
          <section className="card p-5 sm:p-6">
            <h2 className="text-xl font-extrabold">רעיונות להתחלה</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["⚽", "מחולל קבוצות לכדורגל בסופ״ש"],
                ["🍕", "סקר מהיר — מה מזמינים לערב צוות"],
                ["🎂", "ימי הולדת של הצוות"],
                ["💰", "קופה צוותית — מי שילם ומי חייב"],
                ["🧺", "מי מביא מה לערב פלוגה"],
                ["🔎", "לוח אבדות ומציאות"],
              ].map(([emoji, text]) => (
                <li key={text} className="flex min-h-12 items-center gap-3 rounded-ctl bg-surface-2 px-3 text-[14px] font-semibold">
                  <span className="text-xl" aria-hidden="true">
                    {emoji}
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Rules ── */}
          <section className="card relative overflow-hidden p-5 sm:p-6">
            <KabamStamp id="develop-stamp" size={84} className="pointer-events-none absolute -top-2 end-2 opacity-80 sm:end-5 sm:top-3" />
            <h2 className="text-xl font-extrabold">החוקים (בקצרה)</h2>
            <p className="mt-1 max-w-[75%] text-sm text-muted">Claude כבר יודע אותם מהפרומפט — אבל האחריות שלך.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Rules
                ok
                items={["רעיונות לחיי היום-יום בגדוד", "כניסה רק דרך צ1", "עברית, מימין לשמאל, עובד בטלפון"]}
              />
              <Rules
                items={["מידע מסווג, תוכניות אימונים או מיקומים", "מ.א., ת״ז, כתובות, מידע רפואי, ציונים", "לבקש סיסמה — בטח לא של צה״ל"]}
              />
            </div>
            <Link href="/kabam" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent underline-offset-4 hover:underline">
              <Stamp className="size-4" aria-hidden="true" /> דבר הקב״מית המלא
            </Link>
          </section>

          {/* ── FAQ ── */}
          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <MessageCircleQuestion className="size-5 text-accent" aria-hidden="true" /> שאלות
            </h2>
            <div className="mt-3 divide-y divide-line">
              <Faq q="אני לא יודע/ת לתכנת. זה באמת בשבילי?">כן. מתארים מה רוצים, Claude כותב את הקוד ומסביר כל צעד. כשמשהו לא עובד — מעתיקים לו את השגיאה ומבקשים שיתקן.</Faq>
              <Faq q="כמה זה עולה?">Claude Code דורש מנוי Claude בתשלום (Pro ומעלה). GitHub ו-GitHub Pages בחינם.</Faq>
              <Faq q="האתר צריך לשמור מידע. מה עושים?">אומרים את זה ל-Claude — הוא יציע להקים מסד נתונים חינמי (למשל Supabase) ויחבר אותו נכון, כולל אימות המשתמש מול צ1.</Faq>
              <Faq q="למה לא רואים את האתר שלי בדף הבית?">הוא מחכה לאישור הקב״מית ומנהל האתר. את המצב רואים ב&quot;הוספת אפליקציה&quot; ← &quot;ההצעות שלי&quot;.</Faq>
              <Faq q="נתקעתי.">
                כותבים ב-
                <Link href="/feedback" className="font-semibold text-accent underline-offset-4 hover:underline">
                  שינויים ושיפורים
                </Link>{" "}
                ומישהו יעזור.
              </Faq>
            </div>
          </section>

          <Link href="/a/add-app" className="btn h-14 w-full gap-2 text-base">
            <Send className="size-5" aria-hidden="true" /> האתר מוכן? להצעה בצ1
          </Link>
        </div>
      </main>
    </>
  );
}

function Need({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-bg-elevated p-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>
      <p className="mt-3 font-extrabold">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function Step({ n, icon, title, children, last = false }: { n: number; icon: ReactNode; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last ? <span className="absolute start-[21px] top-12 h-[calc(100%-3rem)] w-px bg-line-strong" aria-hidden="true" /> : null}
      <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-accent/30 bg-surface text-accent [&_svg]:size-5">
        {icon}
        <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-contrast">{n}</span>
      </span>
      <div className="min-w-0 flex-1 pt-1.5 text-[14px] leading-relaxed text-muted [&_b]:text-fg">
        <h3 className="mb-1 text-base font-extrabold text-fg">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <pre dir="ltr" className="mt-2 overflow-x-auto rounded-ctl bg-[#0b1a33] p-3 text-start font-mono text-[13px] leading-relaxed text-[#e7edf8]">
      {children}
    </pre>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 rounded-ctl bg-gold-soft px-3 py-2 text-[13px] text-fg">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-elevated p-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>
      <p className="mt-3 font-extrabold">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Rules({ ok = false, items }: { ok?: boolean; items: string[] }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <div className={`rounded-2xl border p-4 ${ok ? "border-success/25 bg-success-soft/50" : "border-danger/25 bg-danger-soft/50"}`}>
      <p className={`flex items-center gap-2 text-sm font-extrabold ${ok ? "text-success" : "text-danger"}`}>
        <Icon className="size-[18px]" aria-hidden="true" /> {ok ? "כן" : "לא"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[14px] leading-relaxed">
            <span className={`mt-[9px] size-1.5 shrink-0 rounded-full ${ok ? "bg-success" : "bg-danger"}`} aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group py-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-bold">
        {q}
        <span className="text-xl leading-none text-subtle transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <p className="pb-3 text-[14px] leading-relaxed text-muted">{children}</p>
    </details>
  );
}
