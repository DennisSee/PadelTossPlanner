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
  const navigation = navigationModelFromAccount(await loadOptionalAccountContext());

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
            <h2 className={styles.sideTitle}>Doe mee met de volgende TOS</h2>
            <p className={styles.sideText}>
              Log in met je e-mailadres en bekijk je account en TOS-status.
            </p>
            <SecondaryLinkButton href="/login?next=%2Ftos">
              Inloggen / aanmelden
            </SecondaryLinkButton>
          </Card>
        </div>
      </div>
    </main>
  );
}
