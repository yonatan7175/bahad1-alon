import { describe, expect, it } from "vitest";
import { normalizeGithubRepo, normalizeSiteUrl } from "@/lib/submissions";

describe("add-app link validation", () => {
  it("accepts https websites and adds https:// when missing", () => {
    expect(normalizeSiteUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeSiteUrl("  example.co.il/path?x=1 ")).toBe("https://example.co.il/path?x=1");
  });
  it("rejects http, IPs, credentials, local hosts, scripts and GitHub", () => {
    for (const bad of ["http://example.com", "https://10.0.0.1", "https://a:b@example.com", "https://localhost", "https://printer.local", "javascript:alert(1)", "https://github.com/a/b", "exa mple.com", ""]) {
      expect(normalizeSiteUrl(bad), bad).toBeNull();
    }
  });
  it("normalizes GitHub repository links", () => {
    expect(normalizeGithubRepo("https://github.com/octo-org/my.repo.git")).toEqual({ url: "https://github.com/octo-org/my.repo", owner: "octo-org", repo: "my.repo" });
    expect(normalizeGithubRepo("github.com/a/b/tree/main/src")?.url).toBe("https://github.com/a/b");
    for (const bad of ["https://github.com/a", "https://gitlab.com/a/b", "http://github.com/a/b", "https://github.com/-a/b", "https://github.com/a/.."]) {
      expect(normalizeGithubRepo(bad), bad).toBeNull();
    }
  });
});
