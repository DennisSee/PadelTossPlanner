import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { describe, expect, it, vi } from "vitest";

import { authCookieOptionsForOrigin } from "./cookie-options";

const SUPABASE_URL = "https://fixture.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_fixture_only";
const STORAGE_KEY = "sb-fixture-auth-token";
const FLOW_ID = "fixture_flow_1234";

type CookieEntry = Readonly<{ name: string; value: string }>;
type CookieWrite = Readonly<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

function encodedJson(value: unknown): string {
  return `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}

function unsignedJwt(expiresAt: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "00000000-0000-4000-8000-000000000001",
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    exp: expiresAt,
  })}.fixture-signature`;
}

function session(expiresAt: number, padding = "") {
  return {
    access_token: unsignedJwt(expiresAt),
    refresh_token: "fixture-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.test",
      app_metadata: {},
      user_metadata: { padding },
      identities: [],
      created_at: "2026-08-20T00:00:00.000Z",
    },
  };
}

function chunk(name: string, value: string, parts: number): CookieEntry[] {
  if (parts === 1) return [{ name, value }];
  const width = Math.ceil(value.length / parts);
  return Array.from({ length: parts }, (_, index) => ({
    name: `${name}.${index}`,
    value: value.slice(index * width, (index + 1) * width),
  }));
}

function cookieHarness(initial: CookieEntry[]) {
  const values = new Map(initial.map(({ name, value }) => [name, value]));
  const writes: CookieWrite[] = [];
  const responseHeaders: Record<string, string>[] = [];

  return {
    values,
    writes,
    responseHeaders,
    cookies: {
      getAll: vi.fn(() =>
        Array.from(values, ([name, value]) => ({ name, value })),
      ),
      setAll: vi.fn(
        (
          cookies: CookieWrite[],
          headers: Record<string, string>,
        ) => {
          responseHeaders.push(headers);
          for (const entry of cookies) {
            writes.push(entry);
            if (entry.options.maxAge === 0) values.delete(entry.name);
            else values.set(entry.name, entry.value);
          }
        },
      ),
    },
  };
}

function serverClient(
  harness: ReturnType<typeof cookieHarness>,
  fetcher: typeof fetch,
) {
  return createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookieOptions: authCookieOptionsForOrigin(
      "https://test-tos.oddbounce.nl",
    ),
    cookies: harness.cookies,
    global: { fetch: fetcher },
  });
}

function expectSecureDeletion(write: CookieWrite | undefined) {
  expect(write?.value).toBe("");
  expect(write?.options).toMatchObject({
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  expect(write?.options).not.toHaveProperty("domain");
  expect(write?.options).not.toHaveProperty("httpOnly", true);
}

describe("official Supabase SSR Auth cookie lifecycle", () => {
  it("lets the official Google PKCE flow create and clean its own verifier cookies", async () => {
    const harness = cookieHarness([
      { name: "tc-zuid-preference", value: "compact" },
    ]);
    const client = createBrowserClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      isSingleton: false,
      cookieOptions: authCookieOptionsForOrigin(
        "https://test-tos.oddbounce.nl",
      ),
      auth: {
        experimental: { appendPkceFlowIdToRedirects: true },
      },
      cookies: harness.cookies,
    });

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          "https://test-tos.oddbounce.nl/auth/callback?next=%2Ftos",
        skipBrowserRedirect: true,
      },
    });

    expect(error).toBeNull();
    expect(data.provider).toBe("google");
    if (!data.url) throw new Error("OAuth fixture URL ontbreekt.");
    const authorize = new URL(data.url);
    expect(authorize.pathname).toBe("/auth/v1/authorize");
    expect(authorize.searchParams.get("provider")).toBe("google");
    const redirectTo = new URL(authorize.searchParams.get("redirect_to") ?? "");
    expect(redirectTo.origin).toBe("https://test-tos.oddbounce.nl");
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/tos");
    expect(redirectTo.searchParams.get("sb_flow_id")).toMatch(
      /^[A-Za-z0-9_-]{8,64}$/u,
    );
    expect(authorize.searchParams.has("scopes")).toBe(false);
    const verifierNames = Array.from(harness.values.keys()).filter((name) =>
      name.startsWith(STORAGE_KEY) && name.endsWith("code-verifier"),
    );
    expect(verifierNames).toHaveLength(3);
    for (const name of verifierNames) {
      const write = harness.writes.find(
        (candidate) => candidate.name === name && candidate.options.maxAge !== 0,
      );
      expect(write?.options).toMatchObject({
        path: "/",
        sameSite: "lax",
        secure: true,
      });
      expect(write?.options).not.toHaveProperty("domain");
    }

    const signOut = await client.auth.signOut({ scope: "local" });
    expect(signOut.error).toBeNull();
    verifierNames.forEach((name) => expect(harness.values.has(name)).toBe(false));
    expect(harness.values.get("tc-zuid-preference")).toBe("compact");
  });

  it.each([1, 3])(
    "signOut(local) removes a session stored in %i cookie chunk(s) and all PKCE flow cookies",
    async (parts) => {
      const future = Math.floor(Date.now() / 1000) + 3600;
      const authCookies = chunk(
        STORAGE_KEY,
        encodedJson(session(future, "x".repeat(parts === 1 ? 0 : 5000))),
        parts,
      );
      const pkceCookies = [
        ...chunk(
          `${STORAGE_KEY}-flow-${FLOW_ID}-code-verifier`,
          encodedJson("fixture-verifier/redirect"),
          1,
        ),
        ...chunk(
          `${STORAGE_KEY}-flows-code-verifier`,
          encodedJson([FLOW_ID]),
          1,
        ),
        ...chunk(
          `${STORAGE_KEY}-code-verifier`,
          encodedJson("fixture-verifier/redirect"),
          1,
        ),
      ];
      const harness = cookieHarness([
        ...authCookies,
        ...pkceCookies,
        { name: "tc-zuid-preference", value: "compact" },
      ]);
      const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

      const { error } = await serverClient(harness, fetcher).auth.signOut({
        scope: "local",
      });

      expect(error).toBeNull();
      for (const { name } of [...authCookies, ...pkceCookies]) {
        expect(harness.values.has(name)).toBe(false);
        expectSecureDeletion(
          harness.writes.find((write) => write.name === name),
        );
      }
      expect(harness.values.get("tc-zuid-preference")).toBe("compact");
      expect(harness.writes.some(({ name }) => name === "tc-zuid-preference")).toBe(
        false,
      );
      expect(harness.responseHeaders).toContainEqual(
        expect.objectContaining({
          "Cache-Control": expect.stringContaining("no-store"),
        }),
      );
    },
  );

  it("refresh replaces stale session chunks without changing cookie scope", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    const future = Math.floor(Date.now() / 1000) + 3600;
    const staleChunks = chunk(
      STORAGE_KEY,
      encodedJson(session(expired, "x".repeat(8000))),
      4,
    );
    const freshSession = session(future);
    const harness = cookieHarness([
      ...staleChunks,
      { name: "tc-zuid-preference", value: "compact" },
    ]);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/auth/v1/token?grant_type=refresh_token");
      return Response.json(freshSession);
    });

    const { data, error } = await serverClient(harness, fetcher).auth.getSession();

    expect(error).toBeNull();
    expect(data.session?.refresh_token).toBe("fixture-refresh-token");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(harness.values.get("tc-zuid-preference")).toBe("compact");
    expect(
      Array.from(harness.values.keys()).filter(
        (name) => name === STORAGE_KEY || name.startsWith(`${STORAGE_KEY}.`),
      ),
    ).toEqual([STORAGE_KEY]);
    const staleDeletions = harness.writes.filter(
      ({ name, options }) =>
        name.startsWith(`${STORAGE_KEY}.`) && options.maxAge === 0,
    );
    expect(staleDeletions.map(({ name }) => name).sort()).toEqual(
      staleChunks.map(({ name }) => name).sort(),
    );
    staleDeletions.forEach(expectSecureDeletion);
    const refreshed = harness.writes.find(
      ({ name, options }) => name === STORAGE_KEY && options.maxAge !== 0,
    );
    expect(refreshed?.options).toMatchObject({
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(refreshed?.options).not.toHaveProperty("domain");
  });
});
