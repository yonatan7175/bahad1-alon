import "server-only";
import type { Db } from "./db-core";

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "cadet" | "commander" | "admin";
  company: string | null;
  platoon: string | null;
  companyId: string | null;
  /** null when the person chose to hide it */
  phone: string | null;
  email: string | null;
  since: Date | null;
}

const SELECT = `select p.id, coalesce(p.full_name, '') as name, p.avatar_url, p.role, c.name as company, pl.name as platoon, p.company_id,
       case when p.show_phone then p.phone end as phone, case when p.show_email then p.email end as email, p.approved_at
  from public.profiles p
  left join public.companies c on c.id = p.company_id
  left join public.platoons pl on pl.id = p.platoon_id
 where p.status = 'approved'`;

type Row = { id: string; name: string; avatar_url: string | null; role: Person["role"]; company: string | null; platoon: string | null; company_id: string | null; phone: string | null; email: string | null; approved_at: Date | null };
const toPerson = (r: Row): Person => ({
  id: r.id,
  name: r.name,
  avatarUrl: r.avatar_url,
  role: r.role,
  company: r.company,
  platoon: r.platoon,
  companyId: r.company_id,
  phone: r.phone,
  email: r.email,
  since: r.approved_at,
});

/** Approved users only; hidden phone/email come back as null (never sent to the browser). */
export async function listPeople(db: Db): Promise<Person[]> {
  const { rows } = await db.query<Row>(`${SELECT} order by c.sort nulls last, c.name nulls last, pl.name nulls last, p.full_name`);
  return rows.map(toPerson);
}

export async function getPerson(db: Db, id: string): Promise<Person | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query<Row>(`${SELECT} and p.id = $1`, [id]);
  return rows[0] ? toPerson(rows[0]) : null;
}
