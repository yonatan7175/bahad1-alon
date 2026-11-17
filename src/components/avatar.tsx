const HUES = [152, 200, 28, 265, 340, 95, 180, 12];

export function Avatar({ name, url, size = 36, className = "" }: { name: string; url: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  if (url && /^https:\/\//.test(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Google avatar; next/image optimization not needed
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full bg-surface-2 object-cover ring-2 ring-surface ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-surface ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `hsl(${hue} 45% 88%)`,
        color: `hsl(${hue} 50% 26%)`,
      }}
    >
      {initials || "?"}
    </span>
  );
}
