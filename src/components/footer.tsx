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
      </div>
    </footer>
  );
}
