"use client";
import { useMemo, type ReactNode } from "react";
import { BahadProvider, createBahad } from "@/platform/client";
import type { RealtimeMode } from "@/platform/client/realtime";
import { useShell } from "./app-frame";

/** Binds the Platform API to this full app's slug (the identity comes from the route file). */
export function FullAppHost({ slug, realtime, children }: { slug: string; realtime: RealtimeMode; children: ReactNode }) {
  const shell = useShell();
  const api = useMemo(() => createBahad(slug, realtime, shell), [slug, realtime, shell]);
  return (
    <BahadProvider value={api}>
      <div className="absolute inset-0 overflow-y-auto">{children}</div>
    </BahadProvider>
  );
}
