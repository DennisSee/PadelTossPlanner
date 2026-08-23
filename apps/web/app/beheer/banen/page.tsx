import { AccountShell } from "../../../components/account/account-shell";
import { Badge, Card, SecondaryLinkButton, StateMessage } from "../../../components/ui";
import { requirePlannerAccount } from "../../../lib/auth/route-guard";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { CourtRepository } from "../../../lib/tos/court-repository";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams: Promise<{ notice?: string; error?: string; sport?: string }> };

export default async function CourtsPage({ searchParams }: Props) {
  const client = await createServerSupabaseClient();
  const account = await requirePlannerAccount(client);
  const query = await searchParams;
  const sportFilter = query.sport === "padel" || query.sport === "tennis" ? query.sport : "all";
  let courts;
  try { courts = await new CourtRepository(client).list(); }
  catch {
    return <AccountShell account={account} title="Banenbeheer" intro="Beheer Padel- en Tennisbanen." variant="management">
      <StateMessage title="Banen tijdelijk niet beschikbaar">Probeer het later opnieuw.</StateMessage>
    </AccountShell>;
  }
  return (
    <AccountShell account={account} title="Banenbeheer" intro="Beheer de banen die per sport in de planner beschikbaar zijn." variant="management">
      <div className={styles.topActions}><SecondaryLinkButton direction="back" href="/beheer">Terug naar beheer</SecondaryLinkButton></div>
      {query.notice ? <p className={styles.success} role="status">Baan opgeslagen.</p> : null}
      {query.error ? <p className={styles.error} role="alert">De baan kon niet worden opgeslagen.</p> : null}
      <nav className={styles.sportFilter} aria-label="Banen filteren">
        <a aria-current={sportFilter === "all" ? "page" : undefined} href="/beheer/banen">Alle banen</a>
        <a aria-current={sportFilter === "padel" ? "page" : undefined} href="/beheer/banen?sport=padel">Padel</a>
        <a aria-current={sportFilter === "tennis" ? "page" : undefined} href="/beheer/banen?sport=tennis">Tennis</a>
      </nav>
      <div className={styles.layout}>
        <Card className={styles.createCard}>
          <h2>Nieuwe baan</h2>
          <form action="/api/beheer/banen/create" method="post" className={styles.form}>
            <label>Sport<select name="sport" defaultValue="padel"><option value="padel">Padel</option><option value="tennis">Tennis</option></select></label>
            <label>Naam<input name="name" maxLength={80} required /></label>
            <label>Volgorde<input name="sort_order" type="number" min={0} max={10000} defaultValue={10} required /></label>
            <label>Status<select name="active" defaultValue="true"><option value="true">Actief</option><option value="false">Inactief</option></select></label>
            <button type="submit">Baan toevoegen</button>
          </form>
        </Card>
        <section className={styles.catalog} aria-labelledby="court-catalog-heading">
          <h2 id="court-catalog-heading">Clubbanen</h2>
          {(["padel", "tennis"] as const).filter((sport) => sportFilter === "all" || sport === sportFilter).map((sport) => {
            const rows = courts.filter((court) => court.sport === sport);
            return <section className={styles.sportGroup} key={sport}>
              <div className={styles.groupHeading}><h3>{sport === "padel" ? "Padel" : "Tennis"}</h3><Badge tone="neutral">{rows.length} {rows.length === 1 ? "baan" : "banen"}</Badge></div>
              {rows.length ? <div className={styles.rows}>{rows.map((court) => <Card className={styles.row} key={court.id}>
                <form action="/api/beheer/banen/update" method="post" className={styles.rowForm}>
                  <input type="hidden" name="court_id" value={court.id} />
                  <label>Naam<input name="name" maxLength={80} defaultValue={court.name} required /></label>
                  <label>Volgorde<input name="sort_order" type="number" min={0} max={10000} defaultValue={court.sortOrder} required /></label>
                  <label>Status<select name="active" defaultValue={String(court.active)}><option value="true">Actief</option><option value="false">Inactief</option></select></label>
                  <button type="submit">Opslaan</button>
                </form>
              </Card>)}</div> : <p className={styles.empty}>Nog geen {sport === "padel" ? "padel" : "tennis"}banen.</p>}
            </section>;
          })}
        </section>
      </div>
    </AccountShell>
  );
}
