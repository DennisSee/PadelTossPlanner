import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Next.js 16 Supabase session Proxy", () => {
  const rootProxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
  const helper = readFileSync(resolve(process.cwd(), "lib/supabase/proxy.ts"), "utf8");

  it("uses proxy.ts and the dedicated refresh helper", () => {
    expect(rootProxy).toContain("export async function proxy");
    expect(rootProxy).toContain("refreshSupabaseSession(request)");
    expect(rootProxy).not.toContain("middleware");
  });

  it("excludes health, static files, images and favicon", () => {
    for (const marker of ["api/health", "_next/static", "_next/image", "favicon.ico", "tc-zuid-logo.png"]) {
      expect(rootProxy).toContain(marker);
    }
  });

  it("verifies claims and forwards refreshed cookies to request and response", () => {
    expect(helper).toContain("auth.getClaims()");
    expect(helper).toContain("request.cookies.set");
    expect(helper).toContain("response.cookies.set");
    expect(helper).not.toContain("getSession(");
  });

  it("keeps public routes available when Auth config or refresh is unavailable", () => {
    expect(helper.indexOf("try {")).toBeLessThan(
      helper.indexOf("readPublicSupabaseConfig()"),
    );
    expect(helper).toContain("catch {");
    expect(helper).toContain("return response");
  });

  it("does not load profile/member data or perform authorization", () => {
    expect(helper).not.toMatch(/profiles|club_members|member_id|\brole\b|redirect/i);
  });
});
