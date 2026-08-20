import { AccountShell, membershipLabel } from "../../components/account/account-shell";
import { Card } from "../../components/ui";
import { requireAccount } from "../../lib/auth/route-guard";

import styles from "../../components/account/account-shell.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusText(state: string): string {
  if (state === "approved") return "Je clubprofiel is klaar. TOS-avonden worden in WEB-4 toegevoegd.";
  if (state === "missing") return "Je clubprofiel is nog niet afgerond. Self-onboarding volgt in een volgende webfase.";
  if (state === "pending") return "Je clubprofiel wacht op goedkeuring. Je kunt nog geen aanmelding opslaan.";
  if (state === "rejected") return "Je clubprofiel is niet goedgekeurd. Neem contact op met de organisatie.";
  if (state === "inactive") return "Je account of clublidmaatschap is inactief.";
  return "Je clubprofiel kan momenteel niet veilig worden gekoppeld.";
}

export default async function TosPage() {
  const account = await requireAccount("/tos");
  return (
    <AccountShell
      account={account}
      title="TOS-avonden"
      intro="Hier komen je eigen en open TOS-avonden in de volgende webfase."
    >
      <Card className={styles.contentCard}>
        <h2>{membershipLabel(account.membership.state)}</h2>
        <p>{statusText(account.membership.state)}</p>
        {account.capabilities.canPlan && !account.capabilities.canParticipate ? (
          <p>Je staffrechten blijven beschikbaar via Beheer.</p>
        ) : null}
      </Card>
    </AccountShell>
  );
}
