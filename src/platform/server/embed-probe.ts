import "server-only";
// Asks an outside website (once, from the server) whether it can be shown inside the portal.
// SSRF guard: https only, no credentials, and EVERY address the host resolves to must be public —
// enforced inside the socket's own DNS lookup, so a rebinding DNS answer cannot slip through.
// Redirects are followed by hand (max 5), each hop checked again. Only the headers are read.
import https from "node:https";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { framingVerdict, isPrivateAddress } from "@/lib/embed";

export interface ProbeResult {
  /** The final URL to frame, or null when the site cannot be shown inside the portal. */
  embedUrl: string | null;
  note: string;
}

export interface ProbeResponse {
  status: number;
  headers: { get(name: string): string | null };
}
export type Fetcher = (url: URL) => Promise<ProbeResponse>;

const TIMEOUT_MS = 5000;
const MAX_HOPS = 5;
const MAX_URL = 600;

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: 0 }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** One GET with the guarded lookup; resolves as soon as the headers arrive (the body is never read). */
export const httpsFetcher: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; PortalLinkCheck/1.0)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "he,en;q=0.8",
        },
      },
      (res) => {
        const raw = res.headers;
        res.destroy();
        req.destroy();
        resolve({
          status: res.statusCode ?? 0,
          headers: {
            get: (name) => {
              const v = raw[name.toLowerCase()];
              return v === undefined ? null : Array.isArray(v) ? v.join(", ") : String(v);
            },
          },
        });
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });

/** Test-only stand-in (BAHAD_EMBED_PROBE_FAKE=1 with mock auth): *.frame.test can be framed, everything else cannot. */
const fakeFetcher: Fetcher = async (url) => ({
  status: 200,
  headers: { get: (n) => (n === "x-frame-options" && !url.hostname.endsWith(".frame.test") ? "DENY" : null) },
});

function defaultFetcher(): Fetcher {
  return process.env.BAHAD_EMBED_PROBE_FAKE === "1" && process.env.BAHAD_AUTH === "mock" ? fakeFetcher : httpsFetcher;
}

function portalOrigin(): string | null {
  const s = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    return s ? new URL(s).origin : null;
  } catch {
    return null;
  }
}

function hopOk(u: URL): boolean {
  return u.protocol === "https:" && !u.username && !u.password && u.href.length <= MAX_URL && !/^[\d.]+$|^\[/.test(u.hostname);
}

function errorNote(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === "EBLOCKED") return "הכתובת מובילה לרשת פנימית — לא נבדק";
  if (code === "ETIMEDOUT") return "האתר לא ענה בזמן — נסו לבדוק שוב";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "שם האתר לא נמצא";
  if (code && /CERT|SSL|TLS/i.test(code)) return "בעיה בתעודת האבטחה (https) של האתר";
  return "לא הצלחנו להתחבר לאתר — נסו לבדוק שוב";
}

const TOTAL_MS = 15_000;

/** Never takes longer than TOTAL_MS, whatever the site does. */
export function probeEmbed(rawUrl: string, opts: { fetcher?: Fetcher; portal?: string | null; totalMs?: number } = {}): Promise<ProbeResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ProbeResult>((r) => {
    timer = setTimeout(() => r({ embedUrl: null, note: "האתר לא ענה בזמן — נסו לבדוק שוב" }), opts.totalMs ?? TOTAL_MS);
  });
  return Promise.race([runProbe(rawUrl, opts), late]).finally(() => clearTimeout(timer));
}

async function runProbe(rawUrl: string, opts: { fetcher?: Fetcher; portal?: string | null } = {}): Promise<ProbeResult> {
  const fetcher = opts.fetcher ?? defaultFetcher();
  const portal = opts.portal === undefined ? portalOrigin() : opts.portal;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { embedUrl: null, note: "כתובת לא תקינה" };
  }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!hopOk(url)) return { embedUrl: null, note: "האתר מפנה לכתובת שאינה https תקינה" };
    let res: ProbeResponse;
    try {
      res = await fetcher(url).catch((e) => {
        // One retry for a slow / dropped connection (not for blocked addresses or unknown hosts).
        if (["EBLOCKED", "ENOTFOUND"].includes((e as { code?: string })?.code ?? "")) throw e;
        return fetcher(url);
      });
    } catch (e) {
      return { embedUrl: null, note: errorNote(e) };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { embedUrl: null, note: "הפניה בלי יעד" };
      try {
        url = new URL(loc, url);
      } catch {
        return { embedUrl: null, note: "הפניה לכתובת לא תקינה" };
      }
      continue;
    }
    if (res.status >= 400) return { embedUrl: null, note: `האתר החזיר שגיאה (${res.status}) — נסו לבדוק שוב` };
    const v = framingVerdict(res.headers, portal);
    return { embedUrl: v.ok ? url.href : null, note: v.note };
  }
  return { embedUrl: null, note: "יותר מדי הפניות" };
}
