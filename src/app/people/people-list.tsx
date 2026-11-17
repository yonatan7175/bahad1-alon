"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Search, UsersRound } from "lucide-react";
import { matchesQuery } from "@/lib/hebrew";
import { ROLE_LABEL } from "@/lib/site";
import { Avatar } from "@/components/avatar";

export interface PersonRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  company: string | null;
  platoon: string | null;
  phone: string | null;
}

export function PeopleList({ people, meId }: { people: PersonRow[]; meId: string }) {
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<string | null>(null);
  const companies = useMemo(() => [...new Set(people.map((p) => p.company).filter((c): c is string => !!c))], [people]);
  const shown = people.filter(
    (p) => (!company || p.company === company) && matchesQuery([p.name, p.company ?? "", p.platoon ?? "", ROLE_LABEL[p.role] ?? "", p.phone ?? ""], q),
  );
  return (
    <>
      <div className="relative mt-5">
        <label htmlFor="people-q" className="sr-only">
          חיפוש
        </label>
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input id="people-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, מחלקה או טלפון" className="field h-12 ps-12" />
      </div>
      {companies.length > 1 ? (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="סינון לפי פלוגה">
          <button type="button" className="chip" aria-pressed={company === null} onClick={() => setCompany(null)}>
            כולם <span className="count">{people.length}</span>
          </button>
          {companies.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={company === c} onClick={() => setCompany(company === c ? null : c)}>
              {c} <span className="count">{people.filter((p) => p.company === c).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center text-muted">
          <UsersRound className="size-8" aria-hidden="true" />
          <p className="mt-2">לא נמצאו אנשים</p>
        </div>
      ) : (
        <ul className="list-group mt-4">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="list-row hover:bg-surface-2" data-testid="person-row">
                <Avatar name={p.name} url={p.avatarUrl} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{p.name}</span>
                    {p.id === meId ? <span className="badge-hidden">את/ה</span> : null}
                    {p.role !== "cadet" ? <span className="badge-accent">{ROLE_LABEL[p.role]}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">{[p.company, p.platoon].filter(Boolean).join(" · ") || "ללא יחידה"}</span>
                </span>
                {p.phone ? (
                  <span className="hidden text-sm tabular-nums text-muted sm:block" dir="ltr">
                    {p.phone}
                  </span>
                ) : null}
                <ChevronLeft className="size-4 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
