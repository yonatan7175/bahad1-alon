"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3 overflow-hidden rounded-ctl border border-line bg-surface-2/70">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-xs font-bold text-muted">פרומפט ל-Claude Code</span>
        <button
          type="button"
          className="btn-secondary min-h-11 gap-1.5 px-3 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "הועתק" : "העתקה"}
        </button>
      </div>
      <pre dir="ltr" className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-start font-mono text-[12px] leading-relaxed" tabIndex={0} aria-label="הפרומפט">
        {text}
      </pre>
    </div>
  );
}
