// Host page for SIMPLE and EXTERNAL apps. Full apps have their own static route
// (src/app/a/<slug>/page.tsx), which Next.js matches before this dynamic one.
import type { Metadata } from "next";
import { getApp } from "@/platform/server/registry";
import { AppPage } from "@/components/app-page";

export async function generateMetadata(props: PageProps<"/a/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: getApp(slug)?.name ?? "אפליקציה" };
}

export default async function SimpleAppRoute(props: PageProps<"/a/[slug]">) {
  const { slug } = await props.params;
  return <AppPage slug={slug} tier={getApp(slug)?.tier === "external" ? "external" : "simple"} />;
}
