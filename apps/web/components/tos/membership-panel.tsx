import type { AccountContext } from "../../lib/auth/account-context";
import type { TosDetailPath } from "../../lib/tos/slug";
import { Card } from "../ui";

import styles from "./tos.module.css";

function statusCopy(state: AccountContext["membership"]["state"]): Readonly<{
  title: string;
  text: string;
}> {
  if (state === "pending") {
    return {
      title: "Goedkeuring in behandeling",
      text: "Je clubprofiel wacht op goedkeuring. Je kunt al inloggen, maar nog geen TOS-aanmelding opslaan.",
    };
  }
  if (state === "rejected") {
    return {
      title: "Clubprofiel niet goedgekeurd",
      text: "Neem contact op met de organisatie als je denkt dat dit niet klopt.",
    };
  }
  if (state === "inactive") {
    return {
      title: "Clubprofiel inactief",
      text: "Je account of clublidmaatschap is inactief. Neem contact op met de organisatie.",
    };
  }
  return {
    title: "Clubprofiel tijdelijk niet beschikbaar",
    text: "Je clubprofiel kan momenteel niet veilig worden geladen. Probeer het later opnieuw.",
  };
}

export function MembershipPanel({
  account,
  returnPath,
}: {
  account: AccountContext;
  returnPath?: TosDetailPath;
}) {
  const canOnboard =
    account.membership.state === "missing" && account.profile?.active === true;
  if (!canOnboard) {
    const copy = statusCopy(account.membership.state);
    return (
      <Card className={styles.membershipCard}>
        <h2 className={styles.formTitle}>{copy.title}</h2>
        <p className={styles.muted}>{copy.text}</p>
        {account.capabilities.canPlan ? (
          <p className={styles.muted}>Je staffrechten blijven beschikbaar via Beheer.</p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className={styles.membershipCard}>
      <h2 className={styles.formTitle}>Maak je clubprofiel aan</h2>
      <p className={styles.muted}>
        Dit is eenmalig nodig om jezelf voor TOS-avonden aan te melden.
        Eventuele planner- of adminrechten blijven ongewijzigd.
      </p>
      <form className={styles.form} action="/api/tos/onboard" method="post">
        {returnPath ? (
          <input type="hidden" name="slug" value={returnPath.slice("/tos/".length)} />
        ) : null}
        <label className={styles.field} htmlFor="display-name">
          Naam
          <input
            className={styles.input}
            id="display-name"
            name="display_name"
            type="text"
            required
            maxLength={120}
            defaultValue={account.profile?.displayName ?? ""}
            autoComplete="name"
          />
        </label>
        <button className={styles.primaryButton} type="submit">
          Clubprofiel aanmaken
        </button>
      </form>
    </Card>
  );
}
