import type { ReactNode } from "react";

import type { AccountContext, MembershipState } from "../../lib/auth/account-context";
import {
  AppHeader,
  Badge,
  CourtLines,
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
  variant = "account",
  currentPath,
  children,
}: {
  account: AccountContext;
  title: string;
  intro: string;
  variant?: "account" | "tos" | "management";
  currentPath?: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle={title} />
          <SiteNavigation model={navigationModelFromAccount(account)} currentPath={currentPath ?? (variant === "management" ? "/beheer" : variant === "tos" ? "/tos" : "/account")} />
        </div>
        <header className={`${styles.pageHeader} ${styles[`pageHeader${variant[0].toUpperCase()}${variant.slice(1)}`]}`}>
          <CourtLines className={styles.headerLines} />
          <div className={styles.headerCopy}>
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          {variant !== "tos" ? (
            <div className={styles.badges} aria-label="Accountmogelijkheden">
              <Badge tone={account.capabilities.canParticipate ? "success" : "neutral"}>
                {membershipLabel(account.membership.state)}
              </Badge>
              {account.capabilities.canPlan ? <Badge tone="warning">Planner</Badge> : null}
              {account.capabilities.canAdminister ? <Badge tone="warning">Admin</Badge> : null}
            </div>
          ) : null}
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

export function displayInitials(displayName: string | null | undefined): string {
  const parts = (displayName ?? "").trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "TC";
  const first = Array.from(parts[0] ?? "")[0] ?? "T";
  const last = parts.length > 1 ? Array.from(parts.at(-1) ?? "")[0] ?? "" : "";
  return `${first}${last}`.toLocaleUpperCase("nl-NL");
}
