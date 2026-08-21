import { notFound } from "next/navigation";

import { AccountShell } from "../../../../components/account/account-shell";
import { TosEventParticipants } from "../../../../components/management/tos-event-participants";
import { requirePlannerAccount } from "../../../../lib/auth/route-guard";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { StaffPlannerInputRepository } from "../../../../lib/tos/staff-planner-input-repository";
import { StaffTosEventRepository } from "../../../../lib/tos/staff-repository";
import { isTosEventSlug } from "../../../../lib/tos/slug";
import type { StaffPlannerInput } from "../../../../lib/tos/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TosEventParticipantsPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isTosEventSlug(slug)) notFound();

  const client = await createServerSupabaseClient();
  const account = await requirePlannerAccount(client);
  let event;
  try {
    event = await new StaffTosEventRepository(client).eventBySlug(slug);
  } catch {
    notFound();
  }
  if (!event) notFound();

  let participants: StaffPlannerInput[] | null;
  try {
    participants = await new StaffPlannerInputRepository(client).plannerInputForEvent(event.id);
  } catch {
    participants = null;
  }

  return (
    <AccountShell
      account={account}
      title="TOS-deelnemers"
      intro="Bekijk aanmeldingen, aandachtspunten en de actuele read-only plannerinput."
    >
      <TosEventParticipants event={event} participants={participants} />
    </AccountShell>
  );
}
