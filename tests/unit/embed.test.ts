import { describe, expect, it } from "vitest";
import { framingVerdict, frameUrlOf, isPrivateAddress, linkAppPath, linkFrameOrigin, linkOpensInside } from "@/lib/embed";
import { probeEmbed, type Fetcher } from "@/platform/server/embed-probe";

const PORTAL = "https://bahad1-alon.duckdns.org";
const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const ID = "3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

describe("framingVerdict", () => {
  it("allows sites with no framing headers", () => {
    expect(framingVerdict(h({}), PORTAL).ok).toBe(true);
  });
  it("blocks X-Frame-Options DENY / SAMEORIGIN (any case), ignores obsolete ALLOW-FROM", () => {
    expect(framingVerdict(h({ "x-frame-options": "DENY" }), PORTAL).ok).toBe(false);
    expect(framingVerdict(h({ "x-frame-options": "sameorigin" }), PORTAL).ok).toBe(false);
    expect(framingVerdict(h({ "x-frame-options": "SAMEORIGIN, SAMEORIGIN" }), PORTAL).ok).toBe(false);
    expect(framingVerdict(h({ "x-frame-options": "ALLOW-FROM https://x.example" }), PORTAL).ok).toBe(true);
  });
  it("reads CSP frame-ancestors", () => {
    const v = (csp: string) => framingVerdict(h({ "content-security-policy": csp }), PORTAL).ok;
    expect(v("frame-ancestors 'none'")).toBe(false);
    expect(v("frame-ancestors 'self'")).toBe(false);
    expect(v("default-src 'self'; frame-ancestors 'self' https://other.example")).toBe(false);
    expect(v("frame-ancestors *")).toBe(true);
    expect(v("frame-ancestors https:")).toBe(true);
    expect(v("frame-ancestors 'self' https://bahad1-alon.duckdns.org")).toBe(true);
    expect(v("frame-ancestors *.duckdns.org")).toBe(true);
    expect(v("frame-ancestors https://*.other.org")).toBe(false);
    expect(v("frame-ancestors http://bahad1-alon.duckdns.org")).toBe(false);
    expect(v("frame-ancestors bahad1-alon.duckdns.org:8443")).toBe(false);
    expect(v("default-src 'self'")).toBe(true); // no frame-ancestors → not restricted
  });
  it("every enforced policy must allow us; report-only is ignored", () => {
    expect(framingVerdict(h({ "content-security-policy": "frame-ancestors *, frame-ancestors 'none'" }), PORTAL).ok).toBe(false);
    expect(framingVerdict(h({ "content-security-policy-report-only": "frame-ancestors 'none'" }), PORTAL).ok).toBe(true);
  });
  it("frame-ancestors overrides X-Frame-Options (as in browsers)", () => {
    expect(framingVerdict(h({ "content-security-policy": "frame-ancestors *", "x-frame-options": "DENY" }), PORTAL).ok).toBe(true);
  });
  it("without a known portal origin, only * / none-restricted sites pass", () => {
    expect(framingVerdict(h({ "content-security-policy": "frame-ancestors https://bahad1-alon.duckdns.org" }), null).ok).toBe(false);
    expect(framingVerdict(h({ "content-security-policy": "frame-ancestors *" }), null).ok).toBe(true);
  });
});

describe("isPrivateAddress", () => {
  it("refuses loopback, private, link-local, CGNAT, multicast and non-IPs", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.171", "169.254.169.254", "100.64.0.1", "100.127.1.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "fc12::3", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::10.0.0.1", "ff02::1", "2001:db8::1", "not-an-ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("link paths and modes", () => {
  it("builds /l/<id>/<host> and the proxy reads the origin back", () => {
    const p = linkAppPath(ID, "https://Write.Bahad1.com/some/page?x=1");
    expect(p).toBe(`/l/${ID}/write.bahad1.com`);
    expect(linkFrameOrigin(p)).toBe("https://write.bahad1.com");
    expect(linkFrameOrigin(`${p}/`)).toBe("https://write.bahad1.com");
    expect(linkFrameOrigin(`/l/${ID}/site.example:8443`)).toBe("https://site.example:8443");
  });
  it("the proxy never puts anything but a plain host into frame-src", () => {
    for (const bad of [
      `/l/${ID}/evil.com;script-src *`,
      `/l/${ID}/evil.com%20*`,
      `/l/${ID}/*`,
      `/l/${ID}/localhost`,
      `/l/${ID}/a.com/more`,
      `/l/not-a-uuid/a.com`,
      `/a/${ID}/a.com`,
      `/l/${ID}`,
    ]) {
      expect(linkFrameOrigin(bad), bad).toBeNull();
    }
  });
  it("auto follows the probe; the admin's choice wins", () => {
    expect(linkOpensInside({ embed_mode: "auto", embed_url: "https://a.example/" })).toBe(true);
    expect(linkOpensInside({ embed_mode: "auto", embed_url: null })).toBe(false);
    expect(linkOpensInside({ embed_mode: "tab", embed_url: "https://a.example/" })).toBe(false);
    expect(linkOpensInside({ embed_mode: "frame", embed_url: null })).toBe(true);
    expect(frameUrlOf({ url: "https://a.example/", embed_url: "https://www.a.example/home" })).toBe("https://www.a.example/home");
    expect(frameUrlOf({ url: "https://a.example/", embed_url: null })).toBe("https://a.example/");
  });
});

describe("probeEmbed", () => {
  const routes = (map: Record<string, { status: number; headers?: Record<string, string> } | Error>): Fetcher & { seen: string[] } => {
    const seen: string[] = [];
    const f = (async (u: URL) => {
      seen.push(u.href);
      const r = map[u.href];
      if (!r) throw Object.assign(new Error("nope"), { code: "ENOTFOUND" });
      if (r instanceof Error) throw r;
      return { status: r.status, headers: h(r.headers ?? {}) };
    }) as Fetcher & { seen: string[] };
    f.seen = seen;
    return f;
  };

  it("follows redirects and frames the FINAL url", async () => {
    const f = routes({
      "https://a.example/": { status: 301, headers: { location: "https://www.a.example/" } },
      "https://www.a.example/": { status: 302, headers: { location: "/he/home" } },
      "https://www.a.example/he/home": { status: 200 },
    });
    expect(await probeEmbed("https://a.example/", { fetcher: f, portal: PORTAL })).toEqual({ embedUrl: "https://www.a.example/he/home", note: "האתר מאפשר הצגה בתוך הפורטל" });
  });
  it("reports sites that refuse framing", async () => {
    const r = await probeEmbed("https://g.example/", { fetcher: routes({ "https://g.example/": { status: 200, headers: { "x-frame-options": "SAMEORIGIN" } } }), portal: PORTAL });
    expect(r.embedUrl).toBeNull();
    expect(r.note).toContain("X-Frame-Options");
  });
  it("never follows a redirect to http, an IP literal or credentials", async () => {
    for (const loc of ["http://a.example/", "https://10.0.0.1/", "https://[::1]/", "https://u:p@a.example/"]) {
      const f = routes({ "https://a.example/": { status: 302, headers: { location: loc } } });
      const r = await probeEmbed("https://a.example/", { fetcher: f, portal: PORTAL });
      expect(r.embedUrl, loc).toBeNull();
      expect(f.seen, loc).toEqual(["https://a.example/"]);
    }
  });
  it("stops redirect loops and errors", async () => {
    const loop = routes({ "https://a.example/": { status: 302, headers: { location: "https://a.example/" } } });
    expect((await probeEmbed("https://a.example/", { fetcher: loop, portal: PORTAL })).note).toBe("יותר מדי הפניות");
    expect(loop.seen.length).toBe(6);
    expect((await probeEmbed("https://a.example/", { fetcher: routes({ "https://a.example/": { status: 503 } }), portal: PORTAL })).embedUrl).toBeNull();
    const blocked = routes({ "https://a.example/": Object.assign(new Error("blocked"), { code: "EBLOCKED" }) });
    expect((await probeEmbed("https://a.example/", { fetcher: blocked, portal: PORTAL })).note).toContain("רשת פנימית");
  });
  it("retries a dropped connection once, but not a blocked or unknown host", async () => {
    let n = 0;
    const flaky: Fetcher = async () => {
      if (n++ === 0) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
      return { status: 200, headers: h({}) };
    };
    expect((await probeEmbed("https://a.example/", { fetcher: flaky, portal: PORTAL })).embedUrl).toBe("https://a.example/");
    expect(n).toBe(2);
    let m = 0;
    const unknown: Fetcher = async () => {
      m++;
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    };
    expect((await probeEmbed("https://a.example/", { fetcher: unknown, portal: PORTAL })).note).toBe("שם האתר לא נמצא");
    expect(m).toBe(1);
  });
  it("gives up after the total time limit", async () => {
    const hang: Fetcher = () => new Promise(() => {});
    const r = await probeEmbed("https://a.example/", { fetcher: hang, portal: PORTAL, totalMs: 50 });
    expect(r).toEqual({ embedUrl: null, note: "האתר לא ענה בזמן — נסו לבדוק שוב" });
  });
  it("the real fetcher refuses hosts that resolve to private addresses", async () => {
    // localhost resolves to 127.0.0.1 / ::1 — the guarded lookup must refuse before connecting.
    const r = await probeEmbed("https://localhost/", { portal: PORTAL });
    expect(r.embedUrl).toBeNull();
    expect(r.note).toContain("רשת פנימית");
  });
});
