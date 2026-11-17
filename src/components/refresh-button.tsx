"use client";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshButton({ label = "בדיקה מחדש" }: { label?: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn" onClick={() => router.refresh()}>
      <RefreshCw className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
