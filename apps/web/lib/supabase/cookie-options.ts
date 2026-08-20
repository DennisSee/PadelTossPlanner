import type { CookieOptions } from "@supabase/ssr";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type AuthCookieOptions = Readonly<
  Required<Pick<CookieOptions, "path" | "sameSite" | "secure">>
>;

export class AuthCookieConfigurationError extends Error {
  constructor() {
    super("De Auth-cookieconfiguratie is niet beschikbaar.");
    this.name = "AuthCookieConfigurationError";
  }
}

export function authCookieOptionsForOrigin(origin: string): AuthCookieOptions {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AuthCookieConfigurationError();
  }

  const isLoopbackHttp =
    parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !isLoopbackHttp) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new AuthCookieConfigurationError();
  }

  return {
    path: "/",
    sameSite: "lax",
    secure: parsed.protocol === "https:",
  };
}

export function browserAuthCookieOptions(runtimeOrigin?: string): AuthCookieOptions {
  const origin = runtimeOrigin ??
    (typeof window === "undefined" ? null : window.location.origin);
  if (!origin) {
    throw new AuthCookieConfigurationError();
  }
  return authCookieOptionsForOrigin(origin);
}
