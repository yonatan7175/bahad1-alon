// /l/<id> → the canonical in-portal page of an approved website, /l/<id>/<host>.
import { notFound, redirect } from "next/navigation";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { approvedLinkApp } from "@/platform/server/submissions";
import { frameUrlOf, linkAppPath } from "@/lib/embed";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LinkAppShortRoute(props: PageProps<"/l/[id]">) {
  const { id } = await props.params;
  await requireApproved(`/l/${id}`);
  if (!uuidRe.test(id)) notFound();
  const link = await approvedLinkApp(await getDb(), id);
  if (!link) notFound();
  redirect(linkAppPath(link.id, frameUrlOf(link)));
}
