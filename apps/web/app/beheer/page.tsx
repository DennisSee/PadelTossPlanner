import { AccountShell } from "../../components/account/account-shell";
import { Card } from "../../components/ui";
import { requirePlannerAccount } from "../../lib/auth/route-guard";

import styles from "../../components/account/account-shell.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ManagementPage() {
  const account = await requirePlannerAccount();
  return (
    <AccountShell
      account={account}
      title="Beheeromgeving"
      intro="Planner- en beheerfuncties worden hier stapsgewijs vanuit Streamlit gemigreerd."
    >
      <Card className={styles.contentCard}>
        <h2>Beheer</h2>
        <p>Je staffrechten zijn veilig geladen via je eigen Supabase-sessie.</p>
        {account.capabilities.canAdminister ? <p>Dit account heeft ook adminrechten.</p> : null}
      </Card>
    </AccountShell>
  );
}
