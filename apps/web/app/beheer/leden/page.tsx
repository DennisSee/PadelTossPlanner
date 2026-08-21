import { AccountShell } from "../../../components/account/account-shell";
import { MemberManagement } from "../../../components/management/member-management";
import styles from "../../../components/management/tos-event-management.module.css";
import { StateMessage } from "../../../components/ui";
import { requirePlannerAccount } from "../../../lib/auth/route-guard";
import { memberManagementMessage } from "../../../lib/tos/member-management-request";
import { StaffMemberRepository } from "../../../lib/tos/staff-member-repository";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams: Promise<{
  q?: string | string[];
  notice?: string | string[];
  error?: string | string[];
}> };

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function MemberManagementPage({ searchParams }: PageProps) {
  const client = await createServerSupabaseClient();
  const account = await requirePlannerAccount(client);
  const params = await searchParams;
  const rawQuery = last(params.q)?.trim() ?? "";
  const query = rawQuery.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(rawQuery) ? rawQuery : "";
  const message = memberManagementMessage(last(params.notice), last(params.error));
  let members;
  try {
    const allMembers = await new StaffMemberRepository(client).list();
    const folded = query.toLocaleLowerCase("nl-NL");
    members = folded
      ? allMembers.filter((member) => member.displayName.toLocaleLowerCase("nl-NL").includes(folded))
      : allMembers;
  } catch {
    return (
      <AccountShell account={account} title="Leden en niveaus" intro="Beheer padel- en tennisprofielen." variant="management" currentPath="/beheer/leden">
        <StateMessage title="Leden tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>
      </AccountShell>
    );
  }
  return (
    <AccountShell account={account} title="Leden en niveaus" intro="Beheer per clublid de actieve sportprofielen en niveaus." variant="management" currentPath="/beheer/leden">
      {message ? (
        <p className={`${styles.message} ${message.tone === "success" ? styles.messageSuccess : styles.messageDanger}`} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
      <MemberManagement members={members} query={query} />
    </AccountShell>
  );
}
