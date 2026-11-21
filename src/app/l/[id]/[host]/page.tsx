// An admin-approved website ("הוספת אפליקציה") opened INSIDE the portal, in the same frame as every app.
// The <host> segment is what the proxy puts in this page's frame-src (src/proxy.ts); a frame is rendered
// ONLY when it matches the approved record, so a hand-made path can never frame anything else.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Globe } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { approvedLinkApp, type LinkApp } from "@/platform/server/submissions";
import { frameUrlOf, linkAppPath, linkOpensInside } from "@/lib/embed";
import { AppFrame, type PublicApp } from "@/components/app-frame";
import { LinkAppHost } from "@/components/link-app-host";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string): Promise<LinkApp | null> {
  return uuidRe.test(id) ? approvedLinkApp(await getDb(), id) : null;
}

export async function generateMetadata(props: PageProps<"/l/[id]/[host]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: (await load(id))?.name ?? "אפליקציה" };
}

function toPublic(l: LinkApp, frameUrl: string): PublicApp {
  return {
    slug: `link-${l.id}`,
    url: frameUrl,
    iconUrl: l.icon ?? "",
    emoji: l.emoji,
    name: l.name,
    description: l.description || "אתר חיצוני שאושר על ידי מנהל האתר.",
    authors: [],
    version: "",
    suggestedBy: l.submitter_name,
    tier: "external",
    scopes: [],
    status: "live",
  };
}

export default async function LinkAppRoute(props: PageProps<"/l/[id]/[host]">) {
  const { id, host } = await props.params;
  await requireApproved(`/l/${id}/${host}`);
  const link = await load(id);
  if (!link) notFound();
  const frameUrl = frameUrlOf(link);
  const canonical = linkAppPath(link.id, frameUrl);
  if (decodeURIComponent(`/l/${id}/${host}`).toLowerCase() !== canonical.toLowerCase()) redirect(canonical);

  return (
    <AppFrame app={toPublic(link, frameUrl)}>
      {linkOpensInside(link) ? (
        <LinkAppHost url={frameUrl} name={link.name} />
      ) : (
        <main className="flex h-full items-center justify-center overflow-y-auto px-4 py-10">
          <div className="card w-full max-w-sm p-6 text-center" data-testid="link-app-launcher">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Globe className="size-8" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-extrabold">{link.name}</h2>
            {link.description ? <p className="mt-1 text-sm">{link.description}</p> : null}
            <p className="mt-3 text-sm text-muted">האתר הזה לא מאפשר הצגה בתוך הפורטל, ולכן הוא נפתח בלשונית חדשה.</p>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn mt-5 min-h-12 w-full">
              <ExternalLink className="size-4" aria-hidden="true" /> פתיחת האתר
            </a>
            <p className="mt-2 break-all text-xs text-subtle" dir="ltr">
              {new URL(link.url).host}
            </p>
          </div>
        </main>
      )}
    </AppFrame>
  );
}
