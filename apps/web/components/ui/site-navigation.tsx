import Link from "next/link";

import type { AccountContext } from "../../lib/auth/account-context";
import styles from "./ui.module.css";

export type NavigationModel = Readonly<{
  authenticated: boolean;
  canPlan: boolean;
}>;

export const ANONYMOUS_NAVIGATION: NavigationModel = Object.freeze({
  authenticated: false,
  canPlan: false,
});

export function navigationModelFromAccount(
  account: AccountContext | null,
): NavigationModel {
  return Object.freeze({
    authenticated: Boolean(account),
    canPlan: Boolean(account?.capabilities.canPlan),
  });
}

function NavigationLinks({ model }: { model: NavigationModel }) {
  if (!model.authenticated) {
    return (
      <>
        <Link href="/">Home</Link>
        <Link href="/live">Live TOS-schema</Link>
        <Link className={styles.navPrimary} href="/login?next=%2Ftos">
          Inloggen / aanmelden
        </Link>
      </>
    );
  }
  return (
    <>
      <Link href="/live">Live TOS-schema</Link>
      <Link href="/tos">TOS-avonden</Link>
      <Link href="/account">Mijn account</Link>
      {model.canPlan ? <Link href="/beheer">Beheer</Link> : null}
    </>
  );
}

export function SiteNavigation({ model }: { model: NavigationModel }) {
  return (
    <nav className={styles.navigation} aria-label="Hoofdnavigatie">
      <div className={styles.desktopNavigation}>
        <NavigationLinks model={model} />
      </div>
      <details className={styles.mobileNavigation}>
        <summary>Menu</summary>
        <div className={styles.mobileNavigationLinks}>
          <NavigationLinks model={model} />
        </div>
      </details>
    </nav>
  );
}
