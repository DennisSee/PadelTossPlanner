export const DEFAULT_RETURN_PATH = "/tos" as const;
export const ALLOWED_RETURN_PATHS = ["/tos", "/account", "/beheer", "/live"] as const;

export type SafeReturnPath = (typeof ALLOWED_RETURN_PATHS)[number];

export function sanitizeReturnPath(value: string | null | undefined): SafeReturnPath {
  if (!value || /[\\\r\n\u0000-\u001f\u007f]/u.test(value)) {
    return DEFAULT_RETURN_PATH;
  }
  return (ALLOWED_RETURN_PATHS as readonly string[]).includes(value)
    ? (value as SafeReturnPath)
    : DEFAULT_RETURN_PATH;
}

export function loginPathFor(next: SafeReturnPath): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export function oauthErrorLoginPath(next: SafeReturnPath): string {
  return `/login?error=oauth&next=${encodeURIComponent(next)}`;
}
