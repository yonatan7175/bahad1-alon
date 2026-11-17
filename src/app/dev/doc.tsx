import { notFound } from "next/navigation";
import { DOCS } from "@/generated/docs";
import { CopyButtons } from "./copy-buttons";

export function Doc({ slug }: { slug: string }) {
  const page = DOCS.find((d) => d.slug === slug);
  if (!page) notFound();
  return (
    <article className="docs card animate-rise p-6 sm:p-10" id="doc">
      {/* Trusted: generated at build time from docs/platform/*.md in this repo. */}
      <div dangerouslySetInnerHTML={{ __html: page.html }} />
      <CopyButtons />
    </article>
  );
}
