// Can an outside website be shown INSIDE the portal (in an iframe)? Pure helpers shared by the
// server probe (src/platform/server/embed-probe.ts), the proxy's CSP and the tests.
import { isIP } from "node:net";

export type EmbedMode = "auto" | "frame" | "tab";

export interface FramingVerdict {
  ok: boolean;
  /** Hebrew, shown to the admin. */
  note: string;
}

interface HeaderBag {
  get(name: string): string | null;
}

/** Does one CSP `frame-ancestors` source expression allow `portal` (e.g. "https://portal.example")? */
function sourceAllows(src: string, portal: URL | null): boolean {
  const s = src.trim().toLowerCase();
  if (s === "*") return true;
  if (s === "'none'" || s === "'self'" || s.startsWith("'")) return false; // 'self' = the site itself, not us
  if (!portal) return false;
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return s === portal.protocol; // scheme-only, e.g. "https:"
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+|\*)(?::(\d+|\*))?(?:\/.*)?$/.exec(s);
  if (!m) return false;
  const [, scheme, wildcard, host, port] = m;
  if (scheme && scheme !== portal.protocol.replace(":", "")) return false;
  if (!scheme && portal.protocol !== "https:" && portal.protocol !== "http:") return false;
  const ph = portal.hostname.toLowerCase();
  const hostOk = host === "*" || (wildcard ? ph.endsWith(`.${host}`) : ph === host);
  if (!hostOk) return false;
  if (port && port !== "*") {
    const pp = portal.port || (portal.protocol === "https:" ? "443" : "80");
    if (port !== pp) return false;
  }
  return true;
}

/**
 * Reads a website's response headers the way a browser would and decides whether the portal may frame it.
 * Only ENFORCED policies count (Content-Security-Policy-Report-Only is ignored). When a policy has
 * frame-ancestors, browsers ignore X-Frame-Options.
 */
export function framingVerdict(headers: HeaderBag, portalOrigin?: string | null): FramingVerdict {
  let portal: URL | null = null;
  try {
    portal = portalOrigin ? new URL(portalOrigin) : null;
  } catch {
    portal = null;
  }
  // Several CSP headers arrive joined with ", "; each is its own policy and ALL of them must allow us.
  const csp = headers.get("content-security-policy") ?? "";
  let sawFrameAncestors = false;
  for (const policy of csp.split(",")) {
    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() !== "frame-ancestors") continue;
      sawFrameAncestors = true;
      if (!sources.some((src) => sourceAllows(src, portal))) {
        return { ok: false, note: "האתר חוסם הצגה בתוך אתרים אחרים (CSP frame-ancestors)" };
      }
    }
  }
  if (!sawFrameAncestors) {
    const xfo = (headers.get("x-frame-options") ?? "").toLowerCase();
    // DENY / SAMEORIGIN block us; ALLOW-FROM is obsolete and ignored by current browsers.
    if (xfo.split(",").some((v) => ["deny", "sameorigin"].includes(v.trim()))) {
      return { ok: false, note: "האתר חוסם הצגה בתוך אתרים אחרים (X-Frame-Options)" };
    }
  }
  return { ok: true, note: "האתר מאפשר הצגה בתוך הפורטל" };
}

/** Should this address never be contacted by the server (loopback, private, link-local, CGNAT, multicast…)? */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    const mapped = /^(?:0*:)*:?(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(s) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (s === "::" || s === "::1") return true;
    const first = parseInt(s.split(":")[0] || "0", 16);
    return (
      (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (first & 0xff00) === 0xff00 || // multicast
      (first === 0x2001 && parseInt(s.split(":")[1] || "0", 16) === 0x0db8) || // documentation
      first === 0 // ::/8 (incl. IPv4-compatible / mapped forms not caught above)
    );
  }
  return true; // not an IP at all → refuse
}

/** The effective way an approved website opens: inside the portal, or in a new tab. */
export function linkOpensInside(row: { embed_mode: EmbedMode | string; embed_url: string | null }): boolean {
  if (row.embed_mode === "tab") return false;
  if (row.embed_mode === "frame") return true;
  return !!row.embed_url;
}

/** The URL the portal frames for an approved website (the probe's final URL, else the submitted one). */
export function frameUrlOf(row: { url: string; embed_url: string | null }): string {
  return row.embed_url ?? row.url;
}

/** The in-portal path of an approved website. The host is part of the path so the proxy can scope frame-src to it. */
export function linkAppPath(id: string, frameUrl: string): string {
  return `/l/${id}/${new URL(frameUrl).host}`;
}

const LINK_PATH = /^\/l\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/([a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?)\/?$/i;

/**
 * For the proxy: the https origin that /l/<id>/<host> may frame, or null. Taken from the path only
 * (no database in the proxy); safe because that page renders a frame ONLY when <host> matches the
 * approved record, and the strict regex keeps anything but a host name out of the CSP header.
 */
export function linkFrameOrigin(pathname: string): string | null {
  const m = LINK_PATH.exec(pathname);
  return m ? `https://${m[1].toLowerCase()}` : null;
}
