import type { ReactNode } from "react";

import type { AccountContext, MembershipState } from "../../lib/auth/account-context";
import {
  AppHeader,
  Badge,
  navigationModelFromAccount,
  SiteNavigation,
} from "../ui";
import styles from "./account-shell.module.css";

const MEMBERSHIP_LABELS: Record<MembershipState, string> = {
  missing: "Clubprofiel nog niet afgerond",
  pending: "Goedkeuring in behandeling",
  approved: "Clublid goedgekeurd",
  rejected: "Clublidmaatschap niet goedgekeurd",
  inactive: "Account of clublid inactief",
  inconsistent: "Clubprofiel tijdelijk niet beschikbaar",
};

export function membershipLabel(state: MembershipState): string {
  return MEMBERSHIP_LABELS[state];
}

export function AccountShell({
  account,
  title,
  intro,
  children,
}: {
  account: AccountContext;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle={title} />
          <SiteNavigation model={navigationModelFromAccount(account)} />
        </div>
        <header className={styles.pageHeader}>
          <div>
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          <div className={styles.badges} aria-label="Accountmogelijkheden">
            <Badge tone={account.capabilities.canParticipate ? "success" : "neutral"}>
              {membershipLabel(account.membership.state)}
            </Badge>
            {account.capabilities.canPlan ? <Badge tone="warning">Planner</Badge> : null}
            {account.capabilities.canAdminister ? <Badge tone="warning">Admin</Badge> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function LogoutForm() {
  return (
    <form action="/auth/logout" method="post">
      <button className={styles.logoutButton} type="submit">Uitloggen</button>
    </form>
  );
}
