import type { Metadata } from "next";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { listPeople } from "@/platform/server/directory";
import { PortalHeader } from "@/components/portal-header";
import { PeopleList } from "./people-list";

export const metadata: Metadata = { title: "אנשים" };

export default async function PeoplePage() {
  const session = await requireApproved("/people");
  const people = await listPeople(await getDb());
  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <p className="section-title">ספר טלפונים</p>
        <h1 className="mt-1 text-3xl font-extrabold">אנשים</h1>
        <p className="mt-1 text-sm text-muted">כל מי שמאושר באתר. כל אחד יכול להסתיר את הטלפון או האימייל שלו בפרופיל.</p>
        <PeopleList
          meId={session.profile.id}
          people={people.map((p) => ({ ...p, since: p.since ? new Date(p.since).toISOString() : null }))}
        />
      </main>
    </>
  );
}
