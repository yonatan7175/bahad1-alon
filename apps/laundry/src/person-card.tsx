"use client";
// Who booked this slot — the person's directory card (scope "directory"), with quick actions.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { useBahad, type Person } from "@/platform/client";

const ROLE: Record<string, string> = { cadet: "חניך/ה", commander: "מפקד/ת", admin: "מנהל/ת" };
const intl = (phone: string) => "972" + phone.replace(/\D/g, "").replace(/^0/, "");

function Initials({ name, url }: { name: string; url: string | null }) {
  if (url && url.startsWith("https://")) {
    // eslint-disable-next-line @next/next/no-img-element -- external profile picture
    return <img src={url} alt="" width={56} height={56} referrerPolicy="no-referrer" className="size-14 rounded-full object-cover" />;
  }
  const t = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  return <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent-ink">{t || "?"}</span>;
}

export function PersonCard({ id, fallbackName }: { id: string; fallbackName: string }) {
  const bahad = useBahad();
  const [p, setP] = useState<Person | null | "error">(null);
  useEffect(() => {
    let alive = true;
    bahad.people
      .get(id)
      .then((x) => alive && setP(x))
      .catch(() => alive && setP("error"));
    return () => {
      alive = false;
    };
  }, [bahad, id]);

  if (p === null) return <div className="skeleton h-28" aria-busy="true" />;
  if (p === "error") return <p className="rounded-ctl bg-surface-2 p-3 text-sm">שוריין ע״י {fallbackName}</p>;
  return (
    <div className="rounded-card border border-line bg-bg-elevated p-4" data-testid="booker-card">
      <div className="flex items-center gap-3">
        <Initials name={p.name} url={p.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{p.name}</p>
          <p className="truncate text-sm text-muted">
            {ROLE[p.role]}
            {p.company ? ` · ${p.company}` : ""}
            {p.platoon ? ` · ${p.platoon}` : ""}
          </p>
        </div>
      </div>
      {p.phone || p.email ? (
        <div className="mt-3 flex gap-2 [&>a]:flex-1">
          {p.phone ? (
            <a href={`tel:${p.phone.replace(/-/g, "")}`} className="btn-secondary flex-col gap-0.5 py-2 text-xs">
              <Phone className="size-[18px] text-accent" aria-hidden="true" /> חיוג
            </a>
          ) : null}
          {p.phone ? (
            <a href={`https://wa.me/${intl(p.phone)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-col gap-0.5 py-2 text-xs">
              <MessageCircle className="size-[18px] text-accent" aria-hidden="true" /> וואטסאפ
            </a>
          ) : null}
          {p.email ? (
            <a href={`mailto:${p.email}`} className="btn-secondary flex-col gap-0.5 py-2 text-xs">
              <Mail className="size-[18px] text-accent" aria-hidden="true" /> מייל
            </a>
          ) : null}
        </div>
      ) : null}
      {p.phone ? (
        <p className="mt-2 text-center text-sm tabular-nums text-muted" dir="ltr">
          {p.phone}
        </p>
      ) : null}
      <Link href={`/people/${p.id}`} className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-accent hover:underline">
        לפרופיל המלא <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
