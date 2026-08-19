import { Badge, AppHeader, Card, LinkButton } from "../components/ui";
import { readAppEnvironment } from "../lib/config/public-supabase";

import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default function Home() {
  const isStaging = readAppEnvironment() === "staging";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Padelavonden voor iedereen" />
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
            <h2 className={styles.sideTitle}>Online aanmelden volgt later</h2>
            <p className={styles.sideText}>
              WEB-2 brengt eerst het publieke live schema naar de nieuwe website.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
