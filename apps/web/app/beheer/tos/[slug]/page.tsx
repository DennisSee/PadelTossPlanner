import { notFound } from "next/navigation";

import { AccountShell } from "../../../../components/account/account-shell";
import { PlannerWorkspace } from "../../../../components/management/planner-workspace";
import { TosEventParticipants } from "../../../../components/management/tos-event-participants";
import { requirePlannerAccount } from "../../../../lib/auth/route-guard";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { StaffPlannerInputRepository } from "../../../../lib/tos/staff-planner-input-repository";
import { editablePlannerPlayers, importRegistrations } from "../../../../lib/tos/planner-draft";
import { PlannerDraftRepository } from "../../../../lib/tos/planner-draft-repository";
import { plannerMessage } from "../../../../lib/tos/planner-management-request";
import { StaffScheduleRepository } from "../../../../lib/tos/schedule-repository";
import { StaffTosEventRepository } from "../../../../lib/tos/staff-repository";
import { isUuid } from "../../../../lib/tos/parser";
import { isTosEventSlug } from "../../../../lib/tos/slug";
import type { StaffPlannerInput } from "../../../../lib/tos/types";
import { randomUUID } from "node:crypto";
import { StateMessage } from "../../../../components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ notice?: string | string[]; error?: string | string[]; schedule?: string | string[] }>;
};

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function TosEventParticipantsPage({ params, searchParams = Promise.resolve({}) }: PageProps) {
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

  const query = await searchParams;
  const message = plannerMessage(last(query.notice), last(query.error));
  let workspaceProps: Parameters<typeof PlannerWorkspace>[0] | null = null;
  let workspaceUnavailable = false;
  if (event.sport === "padel") {
    try {
      const draft = await new PlannerDraftRepository(client).load(event);
      const preview = participants ? importRegistrations(event, draft, participants, randomUUID).preview : [];
      const scheduleRepository = new StaffScheduleRepository(client);
      const schedules = await scheduleRepository.list(event.id);
      const requestedSchedule = last(query.schedule);
      const selectedSchedule = requestedSchedule && isUuid(requestedSchedule)
        ? await scheduleRepository.detail(event.id, requestedSchedule)
        : null;
      workspaceProps = {
          event: {
            slug: event.slug,
            title: event.title,
            sport: event.sport,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            signupDeadline: event.signupDeadline,
            status: event.status,
          },
          draft: {
            players: editablePlannerPlayers(event, draft.players),
            selectedCourts: draft.selectedCourts,
            matchMinutes: draft.matchMinutes,
            restMinutes: draft.restMinutes,
            searchProfile: draft.searchProfile,
            allowRepeatPartners: draft.allowRepeatPartners,
            levelMix: draft.levelMix,
            teamDifferenceTolerance: draft.teamDifferenceTolerance,
            revision: draft.revision,
            updatedByName: draft.updatedByName,
            updatedAt: draft.updatedAt,
          },
          importPreview: preview,
          schedules: schedules.map((schedule) => ({
            id: schedule.id,
            createdByName: schedule.createdByName,
            isPublished: schedule.isPublished,
            generationSeed: schedule.generationSeed,
            plannerDraftRevision: schedule.plannerDraftRevision,
            createdAt: schedule.createdAt,
            canPublish: account.capabilities.canAdminister || schedule.createdBy === account.identity.userId,
          })),
          selectedSchedule: selectedSchedule ? {
            id: selectedSchedule.id,
            title: selectedSchedule.title,
            eventDate: selectedSchedule.eventDate,
            startTime: selectedSchedule.startTime,
            endTime: selectedSchedule.endTime,
            matchMinutes: selectedSchedule.matchMinutes,
            courts: selectedSchedule.courts,
            schedule: selectedSchedule.schedule,
            statistics: selectedSchedule.statistics,
            diagnostics: selectedSchedule.diagnostics,
          } : null,
      };
    } catch {
      workspaceUnavailable = true;
    }
  }
  const workspace = workspaceUnavailable
    ? <StateMessage title="Planneropzet tijdelijk niet beschikbaar"><p>Probeer het later opnieuw.</p></StateMessage>
    : workspaceProps ? <PlannerWorkspace {...workspaceProps} /> : null;

  return (
    <AccountShell
      account={account}
      title="TOS-deelnemers"
      intro="Bekijk aanmeldingen en werk voor padel gecontroleerd verder naar een schema."
      variant="management"
    >
      {message ? <StateMessage title={message.text}><span role={message.tone === "danger" ? "alert" : "status"} /></StateMessage> : null}
      <TosEventParticipants event={event} participants={participants} />
      {workspace}
    </AccountShell>
  );
}
