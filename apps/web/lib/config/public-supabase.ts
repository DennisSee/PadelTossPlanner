import "server-only";

export type AppEnvironment = "development" | "test" | "staging" | "production";

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export class PublicConfigurationError extends Error {
  constructor() {
    super("De publieke schemaconfiguratie is niet beschikbaar.");
    this.name = "PublicConfigurationError";
  }
}

export function readAppEnvironment(
  environment: EnvironmentSource = process.env,
): AppEnvironment {
  const value = environment.APP_ENV?.trim().toLocaleLowerCase("en-US");
  if (value === "development" || value === "test" || value === "staging") {
    return value;
  }
  return "production";
}

export function readPublicSupabaseConfig(
  environment: EnvironmentSource = process.env,
): PublicSupabaseConfig {
  const url = environment.SUPABASE_URL?.trim() ?? "";
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new PublicConfigurationError();
  }

  const isLoopbackHttp =
    parsedUrl.protocol === "http:" && LOOPBACK_HOSTS.has(parsedUrl.hostname);
  const isSafeProtocol = parsedUrl.protocol === "https:" || isLoopbackHttp;
  const isPublishable = publishableKey.startsWith("sb_publishable_");
  if (!isSafeProtocol || !parsedUrl.hostname || !isPublishable) {
    throw new PublicConfigurationError();
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), publishableKey };
}
