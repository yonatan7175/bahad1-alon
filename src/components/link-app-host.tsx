"use client";
// An admin-approved website ("הוספת אפליקציה") shown INSIDE the portal, like any other app.
// Same isolation as tier "external" (src/components/external-app-host.tsx): its own origin, no
// Platform API, no referrer; the page's CSP lets this one frame reach only this site's origin.
import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { EXTERNAL_APP_SANDBOX } from "./external-app-host";

const SLOW_MS = 8000;

export function LinkAppHost({ url, name }: { url: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hintClosed, setHintClosed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  // The "open in a new tab" hint fades out on its own after a few seconds (the ⋮ menu keeps the option).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setHintClosed(true), 7000);
    return () => clearTimeout(t);
  }, [loaded]);

  return (
    <>
      <iframe
        src={url}
        title={name}
        sandbox={EXTERNAL_APP_SANDBOX}
        referrerPolicy="no-referrer"
        allow="clipboard-write; fullscreen"
        className="absolute inset-0 h-full w-full border-0 bg-white"
        data-testid="external-app-frame"
        onLoad={() => setLoaded(true)}
      />
      {!loaded ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg text-muted" role="status" data-testid="link-app-loading">
          <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm font-medium">טוען את {name}…</p>
          {slow ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-2 min-h-11 text-sm">
              <ExternalLink className="size-4" aria-hidden="true" /> לוקח הרבה זמן? פתיחה בלשונית חדשה
            </a>
          ) : null}
        </div>
      ) : null}
      {loaded && !hintClosed ? (
        // Some sites load but need a login that only works in a full tab — keep a quiet way out.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex animate-rise items-center gap-1 rounded-full border border-line bg-surface/95 py-1 pe-1 ps-3 text-xs shadow-lift backdrop-blur">
            <span className="text-muted">משהו לא עובד?</span>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-bold text-accent hover:underline">
              <ExternalLink className="size-3.5" aria-hidden="true" /> פתיחה בלשונית חדשה
            </a>
            <button type="button" onClick={() => setHintClosed(true)} aria-label="סגירת ההודעה" className="icon-btn size-9 text-muted">
              ×
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
