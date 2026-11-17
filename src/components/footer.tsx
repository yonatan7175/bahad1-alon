import { CONTACT_URL, SCHOOL_NAME } from "@/lib/site";
import { OakMark } from "./brand";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-subtle">
        <OakMark size={22} className="opacity-70" />
        <p className="font-semibold text-muted">{SCHOOL_NAME} · גדוד אלון</p>
        <p>כלי לא רשמי שנבנה ע&quot;י חניכי גדוד אלון · אינו מערכת רשמית של צה&quot;ל</p>
        <p>
          אין להעלות לאתר מידע מסווג, מספרים אישיים, מיקומים או מידע רפואי
          {CONTACT_URL ? (
            <>
              {" · "}
              <a className="underline underline-offset-2 hover:text-fg" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
                יצירת קשר
              </a>
            </>
          ) : null}
        </p>
      </div>
    </footer>
  );
}
