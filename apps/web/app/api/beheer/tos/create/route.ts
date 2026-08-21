import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import {
  managementRedirect,
} from "../../../../../lib/tos/management-request";
import {
  InvalidStaffEventRequestError,
  sameEventCreateWrite,
  validateCreateEvent,
} from "../../../../../lib/tos/staff-management";
import {
  StaffEventConflictError,
  StaffTosEventRepository,
} from "../../../../../lib/tos/staff-repository";
import {
  exactTextFields,
  hasExactOrigin,
  noStoreResponse,
} from "../../../../../lib/tos/request";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("TOS-eventbeheer is tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) {
    return noStoreResponse("Ongeldig verzoek.", 403);
  }

  let write;
  try {
    const fields = exactTextFields(await request.formData(), {
      title: 160,
      sport: 16,
      event_date: 10,
      starts_at: 5,
      ends_at: 5,
      signup_deadline: 16,
      status: 16,
      max_participants: 3,
    });
    write = validateCreateEvent({
      title: fields.title,
      sport: fields.sport,
      eventDate: fields.event_date,
      startsAt: fields.starts_at,
      endsAt: fields.ends_at,
      signupDeadline: fields.signup_deadline,
      status: fields.status,
      maxParticipants: fields.max_participants,
    });
  } catch {
    return managementRedirect(appBaseUrl, { error: "invalid-request" });
  }

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor("/beheer"), appBaseUrl);
    if (account.profile?.active !== true || !account.capabilities.canPlan) {
      return privateAuthRedirect("/account", appBaseUrl);
    }
    const repository = new StaffTosEventRepository(client);
    await repository.createEvent(write);
    const stored = await repository.eventBySlug(write.slug);
    if (!stored || !sameEventCreateWrite(stored, write)) {
      return managementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    }
    return managementRedirect(appBaseUrl, { notice: "event-created" });
  } catch (error) {
    if (error instanceof StaffEventConflictError) {
      return managementRedirect(appBaseUrl, { error: "conflict" });
    }
    if (error instanceof InvalidStaffEventRequestError) {
      return managementRedirect(appBaseUrl, { error: "invalid-request" });
    }
    return managementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
  }
}
