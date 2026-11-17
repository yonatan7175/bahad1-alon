"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Braces, ClipboardList, FileJson, GitPullRequest, LayoutTemplate, Scale, Sparkles, FileText } from "lucide-react";

const ICONS: Record<string, typeof BookOpen> = {
  "": BookOpen,
  "starter-prompt": Sparkles,
  manifest: FileJson,
  api: Braces,
  cookbook: ClipboardList,
  rules: Scale,
  submitting: GitPullRequest,
  examples: LayoutTemplate,
};

export function DocsNav({ pages }: { pages: { slug: string; title: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="תוכן העניינים" className="md:sticky md:top-20">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:px-0">
        {pages.map((d) => {
          const href = d.slug ? `/dev/${d.slug}` : "/dev";
          const active = pathname === href;
          const Icon = ICONS[d.slug] ?? FileText;
          return (
            <li key={d.slug} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2.5 rounded-ctl px-3 text-sm font-medium transition-colors ${
                  active ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-fg"
                } max-md:border max-md:border-line max-md:bg-surface max-md:rounded-full max-md:[&[aria-current=page]]:bg-fg max-md:[&[aria-current=page]]:text-bg`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {d.title}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 md:mt-4 md:border-t md:border-line md:pt-4">
          <a href="/llms-full.txt" className="flex min-h-10 items-center gap-2.5 rounded-ctl px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg max-md:rounded-full max-md:border max-md:border-line max-md:bg-surface" dir="ltr">
            <FileText className="size-4" aria-hidden="true" /> llms-full.txt
          </a>
        </li>
      </ul>
    </nav>
  );
}
