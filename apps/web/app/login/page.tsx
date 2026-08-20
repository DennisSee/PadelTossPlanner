import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthLogin } from "../../components/auth/auth-login";
import { AppHeader, Card } from "../../components/ui";
import { buildOAuthCallbackUrl } from "../../lib/auth/oauth";
import { sanitizeReturnPath } from "../../lib/auth/return-path";
import { destinationForAccount, loadOptionalAccountContext } from "../../lib/auth/session";
import {
  PublicConfigurationError,
  readAppRuntimeConfig,
} from "../../lib/config/public-supabase";

import styles from "./login.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next.at(-1) : params.next;
  const next = sanitizeReturnPath(rawNext);
  const rawError = Array.isArray(params.error) ? params.error.at(-1) : params.error;
  const account = await loadOptionalAccountContext();
  if (account) redirect(destinationForAccount(next, account));

  let config: {
    url: string;
    publishableKey: string;
    callbackUrl: string;
  } | null = null;
  try {
    const runtimeConfig = readAppRuntimeConfig();
    const oauth = buildOAuthCallbackUrl(runtimeConfig.appBaseUrl, next);
    config = {
      url: runtimeConfig.url,
      publishableKey: runtimeConfig.publishableKey,
      callbackUrl: oauth.callbackUrl,
    };
  } catch (error) {
    if (!(error instanceof PublicConfigurationError)) throw error;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Veilig inloggen" />
          <Link className={styles.backLink} href="/">← Terug</Link>
        </div>
        <Card className={styles.card}>
          <h1 className={styles.title}>Inloggen / aanmelden</h1>
          <p className={styles.intro}>
            Kies Google voor de snelste route of ontvang een eenmalige e-mailcode.
          </p>
          {config ? (
            <AuthLogin
              config={config}
              callbackUrl={config.callbackUrl}
              next={next}
              initialOAuthError={rawError === "oauth"}
            />
          ) : (
            <p className={styles.unavailable} role="alert">
              Inloggen is tijdelijk niet beschikbaar. Probeer het later opnieuw.
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
