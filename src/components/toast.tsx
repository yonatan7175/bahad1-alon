"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}
const ToastContext = createContext<(message: string, tone?: "info" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, tone: "info" | "error" = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message: message.slice(0, 200), tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 5000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-sm flex-col items-center gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex animate-rise items-center gap-2.5 rounded-full border border-line bg-fg py-2.5 ps-3.5 pe-4 text-sm font-medium text-bg shadow-lift"
          >
            {t.tone === "error" ? (
              <CircleAlert className="size-[18px] shrink-0 text-danger" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
