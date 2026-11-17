import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-20 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-2 text-subtle">
        <Compass className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold">הדף לא נמצא</h1>
      <p className="mt-2 text-muted">ייתכן שהאפליקציה הוסרה, או שאין לך הרשאה אליה.</p>
      <Link href="/" className="btn mt-6">
        לדף הבית
      </Link>
    </main>
  );
}
