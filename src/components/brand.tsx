import { EMBLEM_URL, SCHOOL_NAME, SITE_NAME, SITE_SHORT_NAME } from "@/lib/site";

/**
 * The site mark. Shows the approved emblem when NEXT_PUBLIC_EMBLEM_URL is set (put the file in
 * public/brand/), otherwise an ORIGINAL placeholder (an oak — "אלון") — never a copy of official insignia.
 */
export function OakMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  if (EMBLEM_URL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local static emblem
      <img src={EMBLEM_URL} alt="" width={size} height={size} className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[30%] text-white shadow-[var(--shadow-sm)] ${className}`}
      style={{ width: size, height: size, background: "var(--hero)" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 512 512" width={size * 0.62} height={size * 0.62} fill="currentColor">
        <circle cx="256" cy="200" r="104" />
        <circle cx="178" cy="238" r="70" />
        <circle cx="334" cy="238" r="70" />
        <rect x="236" y="250" width="40" height="150" rx="14" />
        <rect x="156" y="392" width="200" height="26" rx="13" />
      </svg>
    </span>
  );
}

/** "בה״ד 1 · גדוד אלון" — the unit line used across the site. */
export const UNIT_LINE = `${SCHOOL_NAME} · ${SITE_SHORT_NAME}`;

export function SchoolBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-current/25 px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${className}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {UNIT_LINE}
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  const first = SITE_NAME.split(" — ")[0];
  return (
    <span className="flex items-center gap-2.5">
      <OakMark size={compact ? 32 : 38} />
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-extrabold tracking-tight">{first}</span>
        <span className="text-xs font-semibold text-muted">{UNIT_LINE}</span>
      </span>
    </span>
  );
}
