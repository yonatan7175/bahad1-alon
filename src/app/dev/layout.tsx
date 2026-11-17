import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { DOCS } from "@/generated/docs";
import { Wordmark } from "@/components/brand";
import { DocsNav } from "./nav";

export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1">
      <header className="glass sticky top-0 z-30 border-b border-line/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/dev" className="flex items-center gap-3 rounded-ctl">
            <Wordmark />
            <span className="badge-accent hidden sm:inline-flex">אתר המפתחים</span>
          </Link>
          <Link href="/" className="btn-ghost text-sm">
            <ArrowRight className="size-4" aria-hidden="true" /> לפורטל
          </Link>
        </div>
      </header>
      <div className="hero">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <p className="text-sm font-semibold opacity-80">אתר המפתחים</p>
          <p className="mt-1 max-w-xl text-2xl font-extrabold sm:text-3xl">בונים אפליקציה לגדוד — עם AI, בערב אחד</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-10 md:py-10">
        <aside className="md:w-60 md:shrink-0">
          <DocsNav pages={DOCS.map((d) => ({ slug: d.slug, title: d.title }))} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
