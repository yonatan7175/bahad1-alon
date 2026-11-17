// Shows an owner-approved OUTSIDE site inside the portal frame (tier "external").
// The site keeps its own origin, so it can never read the portal's cookies or storage,
// and it gets no Platform API (no bridge is attached). allow-same-origin here refers to
// the outside site's OWN origin (its logins/storage keep working), not the portal's.
export const EXTERNAL_APP_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

export function ExternalAppHost({ url, name }: { url: string; name: string }) {
  return (
    <iframe
      src={url}
      title={name}
      sandbox={EXTERNAL_APP_SANDBOX}
      referrerPolicy="no-referrer"
      allow="clipboard-write"
      className="absolute inset-0 h-full w-full border-0 bg-bg"
      data-testid="external-app-frame"
    />
  );
}
