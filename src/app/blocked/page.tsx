import type { Metadata } from "next";
import { Ban, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { CONTACT_URL } from "@/lib/site";

export const metadata: Metadata = { title: "אין גישה" };

export default function Blocked() {
  return (
    <AuthShell>
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Ban className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">אין גישה לאתר</h1>
        <p className="mt-2 text-muted">החשבון הזה לא מאושר לשימוש באתר. אם זו טעות — פנו למנהל.</p>
      </div>
      <div className="mt-6 grid gap-2">
        {CONTACT_URL ? (
          <a className="btn-secondary" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            <Mail className="size-4" aria-hidden="true" /> יצירת קשר
          </a>
        ) : null}
        <SignOutButton className="btn w-full" />
      </div>
    </AuthShell>
  );
}
