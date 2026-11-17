"use client";
import { useEffect } from "react";
import { useToast } from "@/components/toast";

/** One delegated listener for the generated "העתקה" buttons of the code blocks. */
export function CopyButtons() {
  const toast = useToast();
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest?.(".copy-btn");
      const pre = btn?.parentElement?.querySelector("pre");
      if (!btn || !pre) return;
      try {
        await navigator.clipboard.writeText(pre.innerText);
        toast("הועתק ✔");
      } catch {
        toast("ההעתקה נכשלה — סמנו והעתיקו ידנית", "error");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toast]);
  return null;
}
