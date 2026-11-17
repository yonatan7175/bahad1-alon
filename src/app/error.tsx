"use client";
import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-20 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold">משהו השתבש</h1>
      <p className="mt-2 text-muted">נסו שוב. אם זה חוזר — דווחו לנו.</p>
      <button type="button" className="btn mt-6" onClick={reset}>
        ניסיון חוזר
      </button>
    </main>
  );
}
