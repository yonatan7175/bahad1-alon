import Link from "next/link";

/**
 * "אושר קב״ם" — a round rubber-stamp mark (SVG, red ink with a worn-ink texture).
 * `href` makes it a link (sign-in page → /kabam); without it it's decorative.
 * `id` keeps the SVG filter/path ids unique when two stamps share a page.
 */
export function KabamStamp({
  size = 104,
  href,
  id = "kabam",
  animate = false,
  className = "",
}: {
  size?: number;
  href?: string;
  id?: string;
  /** Plays the "pressed onto the page" animation once. */
  animate?: boolean;
  className?: string;
}) {
  const ink = `${id}-ink`;
  const arcTop = `${id}-arc-top`;
  const arcBottom = `${id}-arc-bottom`;
  const svg = (
    <svg viewBox="0 0 200 200" width={size} height={size} className="block overflow-visible" aria-hidden="true">
      <defs>
        {/* Worn ink: speckles knocked out of the strokes + slightly rough edges. */}
        <filter id={ink} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
          {/* alpha = 3.4 − 4·R: solid ink except where the noise is high (~15% small speckles) */}
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4 0 0 0 3.4" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="worn" />
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="worn" in2="warp" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Text arcs (radius 71). Top text sits outside its arc, bottom text inside its arc — both stay in the band between the rings. */}
        <path id={arcTop} d="M 29 100 A 71 71 0 0 1 171 100" fill="none" />
        <path id={arcBottom} d="M 21 100 A 79 79 0 0 0 179 100" fill="none" />
      </defs>
      <g filter={`url(#${ink})`} fill="currentColor" stroke="currentColor">
        <circle cx="100" cy="100" r="93" fill="none" strokeWidth="6" />
        <circle cx="100" cy="100" r="85" fill="none" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="55" fill="none" strokeWidth="2.2" />
        <text fontSize="17" fontWeight="800" letterSpacing="1.5" stroke="none" textAnchor="middle" direction="rtl">
          <textPath href={`#${arcTop}`} startOffset="50%">
            אבטחת מידע · גדוד אלון
          </textPath>
        </text>
        <text fontSize="15" fontWeight="800" letterSpacing="2" stroke="none" textAnchor="middle" direction="rtl">
          <textPath href={`#${arcBottom}`} startOffset="50%">
            ★ בה״ד 1 ★
          </textPath>
        </text>
        {/* Center band */}
        <path d="M 38 80 H 162 M 38 122 H 162" strokeWidth="2.4" fill="none" />
        <text x="100" y="113" fontSize="34" fontWeight="900" stroke="none" textAnchor="middle" direction="rtl">
          אושר
        </text>
        <text x="100" y="146" fontSize="19" fontWeight="800" letterSpacing="1" stroke="none" textAnchor="middle" direction="rtl">
          קב״ם
        </text>
      </g>
    </svg>
  );
  const base = `stamp-ink inline-block -rotate-[11deg] select-none ${animate ? "animate-stamp" : ""} ${className}`;
  if (!href) return <span className={base}>{svg}</span>;
  return (
    <Link
      href={href}
      aria-label="אושר קב״ם — לדבר הקב״מית: הנחיות אבטחת המידע של האתר"
      title="דבר הקב״מית"
      className={`${base} rounded-full transition-transform duration-300 ease-out hover:-rotate-[4deg] hover:scale-[1.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-red)]/35 active:scale-95`}
    >
      {svg}
    </Link>
  );
}
