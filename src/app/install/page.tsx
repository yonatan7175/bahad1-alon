import type { Metadata } from "next";
import { EllipsisVertical, Plus, Share, SquarePlus } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { PortalHeader } from "@/components/portal-header";
import { Z1Seal } from "@/components/brand";
import { InstallTabs } from "./tabs";

export const metadata: Metadata = { title: "הוספה למסך הבית" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-accent-contrast">{n}</span>
      <span className="pt-1 text-[15px] leading-relaxed">{children}</span>
    </li>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 align-middle text-sm font-bold">{children}</span>
);

export default async function InstallPage() {
  const session = await requireApproved("/install");
  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-8 pt-4 sm:pt-6">
        <header className="hero flex items-center gap-4 rounded-[24px] p-5 shadow-lift sm:p-7">
          <Z1Seal size={64} />
          <div>
            <h1 className="text-2xl font-black">צ1 על מסך הבית</h1>
            <p className="mt-1 text-sm opacity-90">אייקון אחד בטלפון — נפתח כמו אפליקציה, בלי לחפש קישור.</p>
          </div>
        </header>

        <InstallTabs
          iphone={
            <ol className="space-y-4">
              <Step n={1}>
                פותחים את צ1 ב-<b>Safari</b> (בכרום באייפון זה עובד רק בגרסאות חדשות).
              </Step>
              <Step n={2}>
                לוחצים על כפתור השיתוף
                <Key>
                  <Share className="size-4" aria-hidden="true" /> שיתוף
                </Key>
                בתחתית המסך (או למעלה באייפד).
              </Step>
              <Step n={3}>
                גוללים למטה ובוחרים
                <Key>
                  <SquarePlus className="size-4" aria-hidden="true" /> הוספה למסך הבית
                </Key>
              </Step>
              <Step n={4}>
                לוחצים <Key>הוסף</Key> בפינה העליונה. זהו — האייקון של צ1 על המסך.
              </Step>
            </ol>
          }
          android={
            <ol className="space-y-4">
              <Step n={1}>
                פותחים את צ1 ב-<b>Chrome</b>.
              </Step>
              <Step n={2}>
                לוחצים על שלוש הנקודות
                <Key>
                  <EllipsisVertical className="size-4" aria-hidden="true" />
                </Key>
                בפינה העליונה.
              </Step>
              <Step n={3}>
                בוחרים
                <Key>
                  <Plus className="size-4" aria-hidden="true" /> הוספה למסך הבית
                </Key>
                (בחלק מהמכשירים: &quot;התקנת אפליקציה&quot;).
              </Step>
              <Step n={4}>
                מאשרים <Key>הוספה</Key> — ואפשר לגרור את האייקון למקום נוח.
              </Step>
            </ol>
          }
        />

        <p className="rounded-ctl bg-surface-2 p-3 text-sm text-muted">
          טיפ: אחרי ההוספה כדאי להפעיל התראות בפרופיל — כך מקבלים תזכורת לכביסה ועדכונים מהקל&quot;ג.
        </p>
      </main>
    </>
  );
}
