import { APP_NAME, EMBLEM_URL, SCHOOL_NAME, SITE_SHORT_NAME } from "@/lib/site";

/** The בה״ד 1 emblem (round). Falls back to the צ1 seal when no emblem file is configured. */
export function Emblem({ size = 36, className = "" }: { size?: number; className?: string }) {
  if (!EMBLEM_URL) return <Z1Seal size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static emblem
    <img
      src={EMBLEM_URL}
      alt={`סמל ${SCHOOL_NAME}`}
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.25)] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Back-compat name used by older pages. */
export const OakMark = Emblem;

/** "צ1" logotype — a navy seal with a gold rim. Used for the app icon and compact spots. */
export function Z1Seal({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] font-black leading-none text-[var(--hero-gold)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--hero-gold)]/50 ${className}`}
      style={{ width: size, height: size, background: "var(--hero)", fontSize: size * 0.46 }}
      aria-hidden="true"
    >
      {APP_NAME}
    </span>
  );
}

/** "בה״ד 1 · גדוד אלון" — the unit line used across the site. */
export const UNIT_LINE = `${SCHOOL_NAME} · ${SITE_SHORT_NAME}`;

export function SchoolBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--hero-gold)]/40 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[var(--hero-gold)] ${className}`}
    >
      <span className="size-1.5 rounded-full bg-[var(--brand-red)]" aria-hidden="true" />
      {UNIT_LINE}
    </span>
  );
}

/** Header brand: emblem + "צ1" + unit line. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Emblem size={compact ? 34 : 40} />
      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-black tracking-tight text-accent-ink">{APP_NAME}</span>
          <span className="h-3.5 w-px self-center bg-line-strong" aria-hidden="true" />
          <span className="text-[13px] font-bold text-fg">{SITE_SHORT_NAME}</span>
        </span>
        <span className="mt-1 text-[11px] font-semibold tracking-wide text-muted">{SCHOOL_NAME} · כל הכלים במקום אחד</span>
      </span>
    </span>
  );
}

/** Thin gold/red ceremonial stripe under headers and heroes. */
export function Ribbon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-[3px] w-full ${className}`}
      style={{ background: "linear-gradient(90deg, var(--hero-gold) 0 42%, var(--brand-red) 42% 58%, var(--hero-gold) 58% 100%)" }}
    />
  );
}
