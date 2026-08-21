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

function NavigationLink({ href, children, primary = false, currentPath }: { href: string; children: string; primary?: boolean; currentPath: string }) {
  const route = href.split("?", 1)[0] ?? href;
  const active = route === "/" ? currentPath === "/" : currentPath === route || currentPath.startsWith(`${route}/`);
  return (
    <Link
      className={`${primary ? styles.navPrimary : ""} ${active ? styles.navActive : ""}`.trim()}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function NavigationLinks({ model, currentPath }: { model: NavigationModel; currentPath: string }) {
  if (!model.authenticated) {
    return (
      <>
        <NavigationLink href="/" currentPath={currentPath}>Home</NavigationLink>
        <NavigationLink href="/live" currentPath={currentPath}>Live TOS-schema</NavigationLink>
        <NavigationLink primary href="/login?next=%2Ftos" currentPath={currentPath}>
          Inloggen / aanmelden
        </NavigationLink>
      </>
    );
  }
  return (
    <>
      <NavigationLink href="/live" currentPath={currentPath}>Live TOS-schema</NavigationLink>
      <NavigationLink href="/tos" currentPath={currentPath}>TOS-avonden</NavigationLink>
      <NavigationLink href="/account" currentPath={currentPath}>Mijn account</NavigationLink>
      {model.canPlan ? <NavigationLink href="/beheer" currentPath={currentPath}>Beheer</NavigationLink> : null}
    </>
  );
}

export function SiteNavigation({ model, currentPath = "" }: { model: NavigationModel; currentPath?: string }) {
  return (
    <nav className={styles.navigation} aria-label="Hoofdnavigatie">
      <div className={styles.desktopNavigation}>
        <NavigationLinks model={model} currentPath={currentPath} />
      </div>
      <details className={styles.mobileNavigation}>
        <summary aria-label="Menu openen">
          <span className={styles.menuLabel}>Menu</span>
          <span className={styles.menuIcon} aria-hidden="true"><span /><span /><span /></span>
        </summary>
        <div className={styles.mobileNavigationLinks}>
          <NavigationLinks model={model} currentPath={currentPath} />
        </div>
      </details>
    </nav>
  );
}
