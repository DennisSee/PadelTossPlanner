import {
  oauthErrorLoginPath,
  sanitizeReturnPath,
  type SafeReturnPath,
} from "./return-path";

export const GOOGLE_AUTH_ERROR_MESSAGE =
  "Inloggen met Google is niet gelukt. Probeer het opnieuw of gebruik een e-mailcode.";

export function buildOAuthCallbackUrl(
  appBaseUrl: string,
  requestedNext: string | null | undefined,
): Readonly<{ callbackUrl: string; next: SafeReturnPath }> {
  const next = sanitizeReturnPath(requestedNext);
  const base = new URL(appBaseUrl);
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", next);
  if (callback.origin !== base.origin) {
    throw new Error("De Auth-callback kon niet veilig worden opgebouwd.");
  }
  return Object.freeze({ callbackUrl: callback.toString(), next });
}

export function isSameOriginOAuthCallback(
  callbackUrl: string,
  runtimeOrigin: string,
): boolean {
  try {
    const callback = new URL(callbackUrl);
    const origin = new URL(runtimeOrigin);
    return (
      callback.origin === origin.origin &&
      callback.pathname === "/auth/callback" &&
      sanitizeReturnPath(callback.searchParams.get("next")) ===
        callback.searchParams.get("next") &&
      [...callback.searchParams.keys()].every((key) => key === "next") &&
      !callback.username &&
      !callback.password &&
      !callback.hash
    );
  } catch {
    return false;
  }
}

export function isPlausibleOAuthCode(value: string | null): value is string {
  return Boolean(
    value &&
      value.length <= 4_096 &&
      !/[\s\u0000-\u001f\u007f]/u.test(value),
  );
}

export function isPlausiblePkceFlowId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{8,64}$/u.test(value));
}

export function oauthFailurePath(next: SafeReturnPath): string {
  return oauthErrorLoginPath(next);
}
