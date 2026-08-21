import { AccountShell, displayInitials, LogoutForm, membershipLabel } from "../../components/account/account-shell";
import { Card } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";

import styles from "../../components/account/account-shell.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  const account = await requireAccount("/account");
  const displayName = account.profile?.displayName ?? "Nog niet beschikbaar";
  return (
    <AccountShell
      account={account}
      title="Mijn account"
      intro="Je identiteit, clubstatus en huidige mogelijkheden binnen T.C. Zuid TOS."
      variant="account"
    >
      <div className={styles.contentGrid}>
        <Card className={styles.contentCard}>
          <h2>Accountgegevens</h2>
          <div className={styles.identityBanner}>
            <span className={styles.initials} aria-hidden="true">{displayInitials(displayName)}</span>
            <span className={styles.identityName}>{displayName}</span>
          </div>
          <dl className={styles.details}>
            <dt>Naam</dt>
            <dd>{displayName}</dd>
            <dt>E-mailadres</dt>
            <dd>{account.identity.email}</dd>
            <dt>Clubstatus</dt>
            <dd>{membershipLabel(account.membership.state)}</dd>
          </dl>
        </Card>
        <Card className={styles.contentCard}>
          <h2>Sessie</h2>
          <p>Je gebruikt één veilige sessie voor deelnemen en eventuele beheertaken.</p>
          <div className={styles.logoutWrap}><LogoutForm /></div>
        </Card>
      </div>
    </AccountShell>
  );
}
