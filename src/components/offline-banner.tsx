"use client";
import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="size-4" aria-hidden="true" />
      אין חיבור לאינטרנט — פעולות חדשות לא יישמרו עד שהחיבור יחזור
    </div>
  );
}
