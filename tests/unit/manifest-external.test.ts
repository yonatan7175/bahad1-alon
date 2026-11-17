import { describe, expect, it } from "vitest";
import { effectiveScopes, manifestSchema } from "@/platform/manifest";

const base = { slug: "ext-app", name: "א", description: "ב", icon: "icon.svg", tags: ["כלים"], authors: ["me"], status: "live", version: "1.0.0" };

describe("external apps", () => {
  it("need an https url and get nothing from the platform", () => {
    const m = manifestSchema.parse({ ...base, tier: "external", url: "https://write.bahad1.com/" });
    expect(effectiveScopes(m)).toEqual([]);
  });
  it("are rejected without url, with http, with scopes or collections", () => {
    expect(manifestSchema.safeParse({ ...base, tier: "external" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, tier: "external", url: "http://x.example/" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, tier: "external", url: "javascript:alert(1)" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, tier: "external", url: "https://x.example/", scopes: ["contact"] }).success).toBe(false);
    expect(
      manifestSchema.safeParse({ ...base, tier: "external", url: "https://x.example/", collections: { c: { read: "own", create: "any" } } }).success,
    ).toBe(false);
  });
  it("only external apps may have a url", () => {
    expect(manifestSchema.safeParse({ ...base, tier: "simple", url: "https://x.example/" }).success).toBe(false);
  });
});
