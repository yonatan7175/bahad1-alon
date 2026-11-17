import "server-only";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { realtimeMode } from "@/platform/server/config";
import { canUseApp, effectiveStatus, getApp, loadOverride } from "@/platform/server/registry";
import type { RegistryApp } from "@/platform/manifest";
import { AppFrame, type PublicApp } from "./app-frame";
import { SimpleAppHost } from "./simple-app-host";
import { FullAppHost } from "./full-app-host";
import { ExternalAppHost } from "./external-app-host";
import Link from "next/link";
import { PauseCircle } from "lucide-react";

function toPublic(a: RegistryApp, status: string): PublicApp {
  return { slug: a.slug, url: a.url ?? null, iconUrl: a.iconUrl, name: a.name, description: a.description, authors: a.authors, version: a.version, tier: a.tier, scopes: a.effectiveScopes, status };
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning">
        <PauseCircle className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted">{text}</p>
      <Link href="/" className="btn mt-6">
        לדף הבית
      </Link>
    </main>
  );
}

/** Server wrapper for /a/<slug>: session, app status, audience, then the right host. */
export async function AppPage({ slug, tier, children }: { slug: string; tier: "simple" | "full" | "external"; children?: ReactNode }) {
  const { profile } = await requireApproved(`/a/${slug}`);
  const app = getApp(slug);
  if (!app || app.tier !== tier) notFound();
  const override = await loadOverride(await getDb(), slug);
  const status = effectiveStatus(app, override);
  if (status === "disabled") {
    return <Unavailable title={app.name} text={`האפליקציה הושבתה זמנית על ידי מנהל${override?.reason ? `: ${override.reason}` : "."}`} />;
  }
  if (!canUseApp(app, status, profile.role)) notFound();
  const realtime = realtimeMode();
  return (
    <AppFrame app={toPublic(app, status)}>
      {tier === "external" ? (
        <ExternalAppHost url={app.url!} name={app.name} />
      ) : tier === "simple" ? (
        <SimpleAppHost slug={slug} name={app.name} realtime={realtime} />
      ) : (
        <FullAppHost slug={slug} realtime={realtime}>
          {children}
        </FullAppHost>
      )}
    </AppFrame>
  );
}
