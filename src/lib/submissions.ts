// Validation for "הוספת אפליקציה" suggestions (pure — shared by the server actions and tests).

export const SUBMISSION_EMOJIS = ["🔗", "📅", "📚", "📝", "🗺️", "🏋️", "🍽️", "🎵", "💬", "🧰", "🎯", "📸", "🧠", "⚙️"] as const;
export const MAX_PENDING_PER_USER = 5;

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** An outside website: https only, a real host name, no credentials. Returns the normalized URL or null. */
export function normalizeSiteUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host) || host.endsWith(".local")) return null;
  if (host === "github.com" || host === "www.github.com") return null; // use the GitHub option
  const href = u.href;
  return href.length <= 300 ? href : null;
}

/** A GitHub repository link → "https://github.com/<owner>/<repo>", or null. */
export function normalizeGithubRepo(raw: string): { url: string; owner: string; repo: string } | null {
  let s = raw.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (!["github.com", "www.github.com"].includes(u.hostname.toLowerCase())) return null;
  const [owner, rawRepo] = u.pathname.split("/").filter(Boolean);
  const repo = (rawRepo ?? "").replace(/\.git$/i, "");
  if (!owner || !GITHUB_OWNER.test(owner) || !GITHUB_REPO.test(repo) || repo === "." || repo === "..") return null;
  return { url: `https://github.com/${owner}/${repo}`, owner, repo };
}

/** Free text from a form field: collapsed whitespace, trimmed, capped. */
export function cleanText(raw: FormDataEntryValue | null, max: number): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
