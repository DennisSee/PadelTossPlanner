import { AccountShell, displayInitials, LogoutForm, membershipLabel } from "../../components/account/account-shell";
import { ActionDialog, Card } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";
import { accountMessage } from "../../lib/auth/account-request";

import styles from "../../components/account/account-shell.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ notice?: string | string[]; error?: string | string[] }>;
};

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function AccountPage({ searchParams }: PageProps) {
  const account = await requireAccount("/account");
  const displayName = account.profile?.displayName ?? "Nog niet beschikbaar";
  const query = await searchParams;
  const message = accountMessage(last(query.notice), last(query.error));
  return (
    <AccountShell
      account={account}
      title="Mijn account"
      intro="Je clubprofiel en accountinstellingen."
      variant="account"
    >
      {message ? (
        <p
          className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`}
          role={message.tone === "danger" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <div className={styles.contentGrid}>
        <Card className={styles.contentCard}>
          <h2>Accountgegevens</h2>
          <div className={styles.identityBanner}>
            <span className={styles.initials} aria-hidden="true">{displayInitials(displayName)}</span>
            <span className={styles.identityCopy}>
              <strong className={styles.identityName}>{displayName}</strong>
              <span>{membershipLabel(account.membership.state)}</span>
            </span>
          </div>
          <dl className={styles.details}>
            <dt>E-mailadres</dt>
            <dd>{account.identity.email}</dd>
          </dl>
          {account.profile?.active && account.profile.memberId ? (
            <div className={styles.nameAction}>
              <div><strong>Zichtbare naam</strong><p>{displayName}</p></div>
              <ActionDialog
                triggerLabel={<span><span className={styles.srOnly}>Zichtbare naam </span>wijzigen <span aria-hidden="true">→</span></span>}
                title="Zichtbare naam wijzigen"
                description="Deze naam is zichtbaar voor andere deelnemers."
                triggerClassName={styles.nameTrigger}
              >
                <form className={styles.nameForm} action="/api/account/display-name" method="post">
                  <label htmlFor="account-display-name">Zichtbare naam</label>
                  <input
                    id="account-display-name"
                    name="display_name"
                    maxLength={120}
                    required
                    defaultValue={displayName}
                    autoComplete="name"
                    data-dialog-initial
                  />
                  <button type="submit">Naam opslaan</button>
                </form>
              </ActionDialog>
              <p className={styles.nameHint}>Deze naam zien andere deelnemers in schema’s en deelnemerslijsten.</p>
            </div>
          ) : (
            <p>Maak eerst je clubprofiel af om je zichtbare naam te wijzigen.</p>
          )}
        </Card>
        <Card className={styles.contentCard}>
          <h2>Sessie</h2>
          <div className={styles.sessionStatus} role="status">
            <span aria-hidden="true" />
            <div><strong>Ingelogd</strong><p>Veilige sessie actief.</p></div>
          </div>
          <div className={styles.logoutWrap}><LogoutForm /></div>
        </Card>
      </div>
    </AccountShell>
  );
}
