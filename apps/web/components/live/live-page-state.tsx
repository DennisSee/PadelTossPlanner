import Link from "next/link";

import {
  ANONYMOUS_NAVIGATION,
  AppHeader,
  SiteNavigation,
  StateMessage,
  type NavigationModel,
} from "../ui";
import styles from "./live-schedule.module.css";

export function LivePageState({
  kind,
  navigation = ANONYMOUS_NAVIGATION,
}: {
  kind: "empty" | "error";
  navigation?: NavigationModel;
}) {
  const copy = kind === "empty"
    ? {
        title: "Geen gepubliceerd schema",
        text: "Er is nog geen gepubliceerd TOS-schema.",
      }
    : {
        title: "Live schema tijdelijk niet bereikbaar",
        text: "Het live schema kan momenteel niet worden geladen. Probeer het later opnieuw.",
      };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Live TOS-schema" />
          <SiteNavigation model={navigation} />
          <Link className={styles.backLink} href="/">← Terug</Link>
        </div>
        <StateMessage title={copy.title}>{copy.text}</StateMessage>
      </div>
    </main>
  );
}
