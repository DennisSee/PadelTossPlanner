import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WEB-3A route guards and cache boundaries", () => {
  it.each([
    ["app/account/page.tsx", 'requireAccount("/account")'],
    ["app/tos/page.tsx", 'requireAccount("/tos")'],
    ["app/beheer/page.tsx", "requirePlannerAccount()"],
  ])("protects %s in server code", (path, guard) => {
    const page = source(path);
    expect(page).toContain(guard);
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain("revalidate = 0");
  });

  it("finalizes Auth server-side with a re-sanitized internal destination", () => {
    const completion = source("app/auth/complete/route.ts");
    expect(completion).toContain("sanitizeReturnPath");
    expect(completion).toContain("loadCurrentAccountContext");
    expect(completion).toContain("destinationForAccount");
    expect(completion).toContain("private, no-store");
    expect(completion).toContain("configurationUnavailable");
    expect(completion).toContain("status: 503");
    expect(completion).not.toMatch(/access_token|refresh_token|service_role/i);
  });

  it("logout is POST-only, origin-bound and clears the local session", () => {
    const logout = source("app/auth/logout/route.ts");
    expect(logout).toContain("export async function POST");
    expect(logout).not.toContain("export async function GET");
    expect(logout).toContain('scope: "local"');
    expect(logout).toContain("origin !== new URL(appBaseUrl).origin");
  });

  it("keeps health independent from Auth and Supabase", () => {
    const health = source("app/api/health/route.ts");
    expect(health).not.toMatch(/auth|supabase|cookie/i);
  });

  it("adds private no-store headers to every authenticated shell", () => {
    const nextConfig = source("next.config.ts");
    for (const route of ["/account/:path*", "/tos/:path*", "/beheer/:path*", "/auth/:path*"]) {
      expect(nextConfig).toContain(route);
    }
    expect(nextConfig.match(/private, no-store, max-age=0/g)).toHaveLength(4);
  });

  it("parses protected-route redirects structurally in staging smoke", () => {
    const smoke = source("../../deploy/staging/smoke-test.sh");
    const validator = source("../../deploy/staging/validate-smoke-redirect.py");
    const fixtures = source("../../deploy/staging/test-smoke-redirects.sh");

    expect(smoke).toContain('python3 "$redirect_validator" "$base_url" "$path"');
    expect(validator).toContain("urlsplit(location)");
    expect(validator).toContain('parsed.path != "/login"');
    expect(validator).toContain('query == [("next", expected_path)]');
    expect(validator).toContain("normalized_origin(location) != base_origin");
    expect(fixtures).toContain('"ongecodeerd relatief" "accept"');
    expect(fixtures).toContain('"gecodeerd relatief" "accept"');
    expect(fixtures).toContain('"gecodeerd TOS-pad" "accept"');
    expect(fixtures).toContain('"gecodeerd beheerpad" "accept"');
    expect(fixtures).toContain('"absoluut same-origin" "accept"');
    expect(fixtures).toContain('"externe origin" "reject"');
    expect(fixtures).toContain('"protocol-relative origin" "reject"');
    expect(fixtures).toContain('"absolute externe next" "reject"');
    expect(fixtures).toContain('"gecodeerde externe bypass" "reject"');
    expect(fixtures).toContain('"verkeerde protected bestemming" "reject"');
    expect(fixtures).toContain('"token in Location" "reject"');
    expect(fixtures).toContain('"refresh-token in Location" "reject"');
    expect(fixtures).toContain('"OTP in Location" "reject"');
    expect(fixtures).toContain('"credentials in absolute URL" "reject"');
    expect(fixtures).toContain('[[ -n "$validator_output" ]]');
  });
});
