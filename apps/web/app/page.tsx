import {
  Badge,
  AppHeader,
  Card,
  LinkButton,
  navigationModelFromAccount,
  SecondaryLinkButton,
  SiteNavigation,
} from "../components/ui";
import { loadOptionalAccountContext } from "../lib/auth/session";
import { readAppEnvironment } from "../lib/config/public-supabase";

import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isStaging = readAppEnvironment() === "staging";
  const account = await loadOptionalAccountContext();
  const navigation = navigationModelFromAccount(account);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Padelavonden voor iedereen" />
          <SiteNavigation model={navigation} />
          {isStaging ? <Badge tone="warning">Staging</Badge> : null}
        </div>

        <div className={styles.hero}>
          <Card className={styles.intro}>
            <p className={styles.eyebrow}>Samen spelen, iedere ronde anders</p>
            <h1 className={styles.title}>Jouw TOS-avond in één oogopslag</h1>
            <p className={styles.lead}>
              Bekijk de actuele wedstrijden, wie er rust heeft en op welke baan je
              volgende ronde speelt.
            </p>
            <LinkButton href="/live">Bekijk live TOS-schema</LinkButton>
          </Card>

          <Card className={styles.side}>
            <div className={styles.sideMark} aria-hidden="true" />
            {account ? (
              <>
                <h2 className={styles.sideTitle}>Bekijk je TOS-avonden</h2>
                <p className={styles.sideText}>
                  Bekijk je komende en open TOS-avonden.
                </p>
                <SecondaryLinkButton href="/tos">
                  Naar TOS-avonden
                </SecondaryLinkButton>
              </>
            ) : (
              <>
                <h2 className={styles.sideTitle}>Doe mee met de volgende TOS</h2>
                <p className={styles.sideText}>
                  Log in met Google of een e-mailcode en bekijk je account en TOS-status.
                </p>
                <SecondaryLinkButton href="/login?next=%2Ftos">
                  Inloggen / aanmelden
                </SecondaryLinkButton>
              </>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
