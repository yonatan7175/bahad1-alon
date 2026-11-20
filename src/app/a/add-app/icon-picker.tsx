"use client";
// Tile image for a suggested website: pick a photo/logo → cropped to a square and shrunk to 192 px
// in the browser → sent as a small data URL in the hidden "icon" field (the server re-validates it).
// Or skip the image and pick an emoji.
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { SUBMISSION_EMOJIS } from "@/lib/submissions";

const SIZE = 192;

async function toSquareDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

export function IconPicker() {
  const [icon, setIcon] = useState("");
  const [emoji, setEmoji] = useState<string>(SUBMISSION_EMOJIS[0]);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  return (
    <fieldset>
      <legend className="label">תמונה לאפליקציה</legend>
      <div className="flex items-center gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-line bg-surface-2 text-3xl shadow-[var(--shadow-sm)]">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked image
            <img src={icon} alt="תצוגה מקדימה" className="size-full object-cover" />
          ) : (
            <span aria-hidden="true">{emoji}</span>
          )}
        </span>
        <div className="flex flex-1 flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" aria-hidden="true" /> {icon ? "החלפת תמונה" : "העלאת תמונה"}
          </button>
          {icon ? (
            <button type="button" className="btn-ghost min-h-11 text-muted" onClick={() => setIcon("")}>
              <Trash2 className="size-4" aria-hidden="true" /> הסרה
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="בחירת תמונה"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErr("");
          if (f.size > 8 * 1024 * 1024) return setErr("התמונה גדולה מדי (עד 8MB)");
          try {
            const url = await toSquareDataUrl(f);
            if (url.length > 120_000) return setErr("לא הצלחנו להקטין את התמונה — נסו תמונה אחרת");
            setIcon(url);
          } catch {
            setErr("לא הצלחנו לקרוא את התמונה — PNG, JPG או WEBP");
          }
        }}
      />
      <input type="hidden" name="icon" value={icon} />
      {err ? <p className="mt-2 text-sm font-medium text-danger">{err}</p> : <p className="hint mt-1.5">תמונה מרובעת נראית הכי טוב. היא תיחתך לריבוע ותוקטן אוטומטית.</p>}
      {!icon ? (
        <>
          <p className="label">או אימוג&apos;י</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="אימוג'י">
            {SUBMISSION_EMOJIS.map((e) => (
              <label key={e} className="cursor-pointer">
                <input type="radio" name="emoji" value={e} checked={emoji === e} onChange={() => setEmoji(e)} className="peer sr-only" />
                <span className="flex size-11 items-center justify-center rounded-ctl border-2 border-line bg-surface text-xl transition-all peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  {e}
                </span>
                <span className="sr-only">{e}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <input type="hidden" name="emoji" value={emoji} />
      )}
    </fieldset>
  );
}
