import Link from "next/link";
import { APP_NAME, SCHOOL_NAME, SITE_SHORT_NAME } from "@/lib/site";
import { Emblem, Ribbon } from "./brand";

export function Footer() {
  return (
    <footer className="mt-12">
      <Ribbon className="opacity-60" />
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 px-4 py-6 text-xs text-subtle">
        <Emblem size={26} className="opacity-90" />
        <p className="font-semibold text-muted">
          <span className="font-black text-accent-ink">{APP_NAME}</span> · {SCHOOL_NAME} · {SITE_SHORT_NAME}
        </p>
        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
        <Link href="/kabam" className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-4 hover:text-fg hover:underline">
          דבר הקב״מית
        </Link>
        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
        <Link href="/develop" className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-4 hover:text-fg hover:underline">
          פיתוח
        </Link>
      </div>
    </footer>
  );
}
