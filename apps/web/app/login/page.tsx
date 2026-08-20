import Link from "next/link";
import { redirect } from "next/navigation";

import { OtpLogin } from "../../components/auth/otp-login";
import { AppHeader, Card } from "../../components/ui";
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
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next.at(-1) : params.next;
  const next = sanitizeReturnPath(rawNext);
  const account = await loadOptionalAccountContext();
  if (account) redirect(destinationForAccount(next, account));

  let config: { url: string; publishableKey: string } | null = null;
  try {
    const runtimeConfig = readAppRuntimeConfig();
    config = {
      url: runtimeConfig.url,
      publishableKey: runtimeConfig.publishableKey,
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
            Gebruik je e-mailadres om een eenmalige inlogcode te ontvangen.
          </p>
          {config ? (
            <OtpLogin config={config} next={next} />
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
