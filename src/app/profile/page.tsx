import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Bell, ChevronLeft, DoorOpen, KeyRound, Palette, Phone, ShieldCheck } from "lucide-react";
import { requireApproved } from "@/platform/auth/session";
import { getDb } from "@/platform/server/db";
import { loadOverrides, visibleApps } from "@/platform/server/registry";
import { vapidConfig } from "@/platform/server/config";
import { ROLE_LABEL } from "@/lib/site";
import { PortalHeader } from "@/components/portal-header";
import { Avatar } from "@/components/avatar";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsToggle } from "./notifications";
import { PhoneForm } from "./phone-form";
import { RoomForm } from "./room-form";
import { PrivacyToggles } from "./privacy-toggles";
import { PasswordChangeForm } from "./password-form";
import { usernameOf } from "@/platform/auth/password";
import { MyPositionsList } from "../roles/positions-ui";
import { myPositions, positionLabel } from "@/platform/server/positions";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "הפרופיל שלי" };

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="flex items-center gap-2.5 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-ctl bg-accent-soft text-accent [&_svg]:size-[18px]">{icon}</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ProfilePage() {
  const session = await requireApproved("/profile");
  const p = session.profile;
  const db = await getDb();
  const positions = await myPositions(db, p.id);
  const username = await usernameOf(db, p.id);
  const contactApps = visibleApps(p.role, await loadOverrides(db))
    .map((x) => x.app)
    .filter((a) => a.effectiveScopes.includes("contact"));
  const unit = [p.company_name, p.platoon_name, p.room ? `חדר ${p.room}` : null].filter(Boolean).join(" · ") || "ללא יחידה";
  return (
    <>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
          <div className="hero h-24 sm:h-28" aria-hidden="true" />
          <div className="flex flex-col items-center px-5 pb-6 text-center sm:flex-row sm:items-end sm:gap-4 sm:text-start">
            <Avatar name={p.full_name ?? ""} url={p.avatar_url} size={88} className="relative z-10 -mt-11 ring-4" />
            <div className="mt-3 min-w-0 sm:mt-0">
              <h1 className="truncate text-2xl font-extrabold">{p.full_name}</h1>
              <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted sm:justify-start">
                <span className="badge-accent">{ROLE_LABEL[p.role]}</span>
                {positions
                  .filter((x) => x.status === "approved")
                  .map((x) => (
                    <span key={x.id} className="badge-accent">
                      {positionLabel(x.name, x.companyName)}
                    </span>
                  ))}
                <span>{unit}</span>
              </p>
              <p className="mt-1 truncate text-sm text-subtle" dir="ltr">
                {p.email || (username ? `@${username}` : "")}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 px-1 text-xs text-subtle">שם, תפקיד ויחידה מתעדכנים ע&quot;י מנהל.</p>

        <div className="mt-5 grid gap-4">
          <Section icon={<Phone aria-hidden="true" />} title="טלפון נייד">
            <PhoneForm phone={p.phone ?? ""} />
          </Section>

          <Section icon={<DoorOpen aria-hidden="true" />} title="חדר במגורים">
            <RoomForm room={p.room ?? ""} />
          </Section>

          <Section icon={<BadgeCheck aria-hidden="true" />} title="תפקידים">
            <MyPositionsList positions={positions} />
            <Link href="/roles" className="btn-secondary mt-3 w-full sm:w-auto">
              בקשה לתפקיד
            </Link>
          </Section>

          <Section icon={<Bell aria-hidden="true" />} title="התראות במכשיר הזה">
            <NotificationsToggle vapidPublicKey={vapidConfig()?.publicKey ?? null} />
          </Section>

          <Section icon={<Palette aria-hidden="true" />} title="מראה">
            <ThemeToggle />
          </Section>

          <Section icon={<ShieldCheck aria-hidden="true" />} title="פרטיות">
            <PrivacyToggles showPhone={p.show_phone} showEmail={p.show_email} hasPhone={!!p.phone} />
            <Link href={`/people/${p.id}`} className="mt-1 mb-3 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline">
              איך אחרים רואים אותי ←
            </Link>
            <p className="section-title mb-1 mt-2">אפליקציות</p>
            {contactApps.length === 0 ? (
              <p className="text-sm text-muted">אף אפליקציה לא מקבלת את האימייל או הטלפון שלך.</p>
            ) : (
              <>
                <p className="text-sm text-muted">האפליקציות האלה מקבלות את האימייל והטלפון שלך (באישור מנהל האתר):</p>
                <ul className="mt-2 list-group">
                  {contactApps.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/a/${a.slug}`} className="list-row hover:bg-surface-2">
                        <span className="flex-1 font-medium">{a.name}</span>
                        <ChevronLeft className="size-4 text-subtle" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-3 text-xs text-subtle">כל אפליקציה מקבלת שם ותמונה. ההרשאות של כל אפליקציה מופיעות בתפריט ⋮ ← &quot;על האפליקציה&quot;.</p>
          </Section>

          {username ? (
            <Section icon={<KeyRound aria-hidden="true" />} title="סיסמה">
              <p className="mb-3 text-sm text-muted">
                שם המשתמש שלך: <span dir="ltr" className="font-semibold text-fg">{username}</span>
              </p>
              <PasswordChangeForm />
            </Section>
          ) : null}

          <SignOutButton className="btn-secondary w-full text-danger" />
        </div>
      </main>
    </>
  );
}
