import { describe, expect, it } from "vitest";
import { redirectTo } from "@/platform/server/redirect";

describe("redirectTo", () => {
  it("emits a relative, ASCII-only Location (Hebrew is percent-encoded)", () => {
    const r = redirectTo("/admin?tab=users&q=מנהל");
    const loc = r.headers.get("location")!;
    expect(loc.startsWith("/admin?tab=users&q=%D7%9E")).toBe(true);
    expect(/^[\x20-\x7e]+$/.test(loc)).toBe(true);
    expect(r.status).toBe(303);
  });
});
