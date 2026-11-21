import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, Building2, CalendarCheck, Mail, MessageCircle, Phone, ShieldCheck, Users } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { getPerson } from "@/platform/server/directory";
import { ROLE_LABEL } from "@/lib/site";
import { PortalHeader } from "@/components/portal-header";
import { Avatar } from "@/components/avatar";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "פרופיל" };

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="list-row">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-ctl bg-surface-2 text-muted [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate font-semibold">{children}</span>
      </span>
    </div>
  );
}

/** "050-1234567" → "972501234567" for wa.me links. */
const intl = (phone: string) => "972" + phone.replace(/\D/g, "").replace(/^0/, "");

export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const session = await requireApproved(`/people/${id}`);
  const p = await getPerson(await getDb(), id);
  if (!p) notFound();
  const isMe = p.id === session.profile.id;
  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link href="/people" className="btn-ghost -ms-2 mb-3 text-sm">
          <ArrowRight className="size-4" aria-hidden="true" /> כל האנשים
        </Link>
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
          <div className="hero h-24" aria-hidden="true" />
          <div className="flex flex-col items-center px-5 pb-6 text-center">
            <Avatar name={p.name} url={p.avatarUrl} size={92} className="relative z-10 -mt-12 ring-4" />
            <h1 className="mt-3 text-2xl font-extrabold">{p.name}</h1>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
              <span className="badge-accent">{ROLE_LABEL[p.role]}</span>
              {p.positions.map((x) => (
                <span key={x} className="badge-accent">
                  {x}
                </span>
              ))}
              {[p.company, p.platoon].filter(Boolean).join(" · ")}
            </p>
            {(p.phone || p.email) && !isMe ? (
              <div className="mt-5 grid w-full grid-cols-3 gap-2">
                {p.phone ? (
                  <a href={`tel:${p.phone.replace(/-/g, "")}`} className="btn-secondary flex-col gap-1 py-2 text-xs">
                    <Phone className="size-5 text-accent" aria-hidden="true" /> חיוג
                  </a>
                ) : null}
                {p.phone ? (
                  <a href={`https://wa.me/${intl(p.phone)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-col gap-1 py-2 text-xs">
                    <MessageCircle className="size-5 text-accent" aria-hidden="true" /> וואטסאפ
                  </a>
                ) : null}
                {p.email ? (
                  <a href={`mailto:${p.email}`} className="btn-secondary flex-col gap-1 py-2 text-xs">
                    <Mail className="size-5 text-accent" aria-hidden="true" /> מייל
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="list-group mt-4">
          <Row icon={<ShieldCheck />} label="סוג משתמש">
            {ROLE_LABEL[p.role]}
          </Row>
          {p.positions.length ? (
            <Row icon={<BadgeCheck />} label={p.positions.length > 1 ? "תפקידים" : "תפקיד"}>
              {p.positions.join(" · ")}
            </Row>
          ) : null}
          <Row icon={<Building2 />} label="פלוגה">
            {p.company ?? "—"}
          </Row>
          <Row icon={<Users />} label="מחלקה">
            {p.platoon ?? "—"}
          </Row>
          <Row icon={<Phone />} label="טלפון">
            {p.phone ? <span dir="ltr">{p.phone}</span> : <span className="font-normal text-muted">לא שותף</span>}
          </Row>
          <Row icon={<Mail />} label="אימייל">
            {p.email ? <span dir="ltr">{p.email}</span> : <span className="font-normal text-muted">לא שותף</span>}
          </Row>
          {p.since ? (
            <Row icon={<CalendarCheck />} label="באתר מאז">
              {new Date(p.since).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" })}
            </Row>
          ) : null}
        </div>
        {isMe ? (
          <Link href="/profile" className="btn-secondary mt-4 w-full">
            עריכת הפרופיל והפרטיות שלי
          </Link>
        ) : null}
      </main>
    </>
  );
}
