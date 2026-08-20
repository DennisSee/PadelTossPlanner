export type AuthErrorCategory =
  | "rate_limit"
  | "invalid_token"
  | "network"
  | "configuration"
  | "unavailable";

type AuthLikeError = Readonly<{
  status?: number;
  code?: string;
  message?: string;
}>;

export function authErrorCategory(error: unknown): AuthErrorCategory {
  const candidate = error && typeof error === "object" ? (error as AuthLikeError) : {};
  const code = String(candidate.code ?? "").toLowerCase();
  const message = String(candidate.message ?? "").toLowerCase();
  if (candidate.status === 429 || code.includes("rate") || message.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    code.includes("otp") ||
    code.includes("token_expired") ||
    message.includes("expired") ||
    message.includes("invalid token")
  ) {
    return "invalid_token";
  }
  if (message.includes("fetch") || message.includes("network")) return "network";
  return "unavailable";
}

export function safeAuthMessage(category: AuthErrorCategory): string {
  if (category === "rate_limit") {
    return "Er is zojuist al een code verstuurd. Probeer het over een minuut opnieuw.";
  }
  if (category === "invalid_token") {
    return "De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.";
  }
  if (category === "configuration") {
    return "Inloggen is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
  }
  return "Inloggen is tijdelijk niet gelukt. Probeer het later opnieuw.";
}
