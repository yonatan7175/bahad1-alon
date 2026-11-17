"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "בהיר", Icon: Sun },
  { value: "dark", label: "כהה", Icon: Moon },
  { value: "system", label: "אוטומטי", Icon: Monitor },
];

/** Applies the theme to <html> and remembers it in a cookie (read by the server layout → no flash). */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") {
    delete root.dataset.theme;
    document.cookie = "theme=; path=/; max-age=0; samesite=lax";
  } else {
    root.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  }
}

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

/** Segmented light / dark / automatic switch. */
export function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the attribute set by the server
    setTheme(readTheme());
  }, []);
  return (
    <div role="radiogroup" aria-label="ערכת צבעים" className="grid grid-cols-3 gap-1 rounded-ctl bg-surface-2 p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => {
            setTheme(value);
            applyTheme(value);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-[9px] font-medium transition-all ${
            size === "sm" ? "min-h-9 text-[13px]" : "min-h-10 text-sm"
          } ${theme === value ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-fg"}`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
