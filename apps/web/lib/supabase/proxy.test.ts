import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.hoisted(() => vi.fn());
const createServerClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("../config/public-supabase", () => ({
  readAppRuntimeConfig: () => ({
    url: "https://fixture.supabase.co",
    publishableKey: "sb_publishable_fixture_only",
    appBaseUrl: "https://test-tos.oddbounce.nl",
  }),
}));

import { refreshSupabaseSession } from "./proxy";

describe("Next.js 16 Supabase session Proxy", () => {
  const rootProxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
  const helper = readFileSync(resolve(process.cwd(), "lib/supabase/proxy.ts"), "utf8");

  beforeEach(() => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    createServerClient.mockImplementation(
      (_url: string, _key: string, options: unknown) => {
        return { auth: { getClaims }, __options: options };
      },
    );
  });

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
    expect(helper).toContain("readAppRuntimeConfig()");
    expect(helper).toContain("authCookieOptionsForOrigin(config.appBaseUrl)");
    expect(helper).toContain("request.cookies.set");
    expect(helper).toContain("response.cookies.set");
    expect(helper).toContain("response.headers.set");
    expect(helper).not.toContain("getSession(");
    expect(helper).not.toMatch(/domain\s*:|httpOnly\s*:/u);
  });

  it("forwards refreshed chunks with the central HTTPS scope to request and response", async () => {
    type CookieWrite = Readonly<{
      name: string;
      value: string;
      options: Record<string, unknown>;
    }>;
    type ClientOptions = Readonly<{
      cookieOptions: Record<string, unknown>;
      cookies: {
        setAll: (
          cookies: CookieWrite[],
          headers: Record<string, string>,
        ) => void;
      };
    }>;
    let options: ClientOptions | undefined;
    createServerClient.mockImplementation(
      (_url: string, _key: string, supplied: ClientOptions) => {
        options = supplied;
        return { auth: { getClaims } };
      },
    );
    const request = new NextRequest("https://test-tos.oddbounce.nl/account");
    const pending = refreshSupabaseSession(request);
    options?.cookies.setAll(
      [
        {
          name: "sb-fixture-auth-token.0",
          value: "fixture-first-chunk",
          options: { path: "/", sameSite: "lax", secure: true },
        },
        {
          name: "sb-fixture-auth-token.1",
          value: "fixture-second-chunk",
          options: { path: "/", sameSite: "lax", secure: true },
        },
      ],
      { "Cache-Control": "private, no-store" },
    );
    const response = await pending;

    expect(options?.cookieOptions).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(request.cookies.get("sb-fixture-auth-token.0")?.value).toBe(
      "fixture-first-chunk",
    );
    expect(request.cookies.get("sb-fixture-auth-token.1")?.value).toBe(
      "fixture-second-chunk",
    );
    expect(response.cookies.get("sb-fixture-auth-token.0")?.value).toBe(
      "fixture-first-chunk",
    );
    expect(response.cookies.get("sb-fixture-auth-token.1")?.value).toBe(
      "fixture-second-chunk",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("Domain=");
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it("keeps public routes available when Auth config or refresh is unavailable", () => {
    expect(helper.indexOf("try {")).toBeLessThan(
      helper.indexOf("readAppRuntimeConfig()"),
    );
    expect(helper).toContain("catch {");
    expect(helper).toContain("return response");
  });

  it("does not load profile/member data or perform authorization", () => {
    expect(helper).not.toMatch(/profiles|club_members|member_id|\brole\b|redirect/i);
  });
});
