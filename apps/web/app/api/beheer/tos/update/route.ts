import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../../lib/config/public-supabase";
import { managementRedirect } from "../../../../../lib/tos/management-request";
import {
  InvalidStaffEventRequestError,
  sameEventUpdate,
  validateUpdateEvent,
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
import { isTosEventSlug } from "../../../../../lib/tos/slug";
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

  let fields: Readonly<Record<string, string>>;
  try {
    fields = exactTextFields(await request.formData(), {
      slug: 80,
      title: 160,
      signup_deadline: 16,
      status: 16,
      max_participants: 3,
    });
    if (!isTosEventSlug(fields.slug)) throw new InvalidStaffEventRequestError();
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
    const before = await repository.eventBySlug(fields.slug);
    if (!before) return managementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    const write = validateUpdateEvent({
      title: fields.title,
      signupDeadline: fields.signup_deadline,
      status: fields.status,
      maxParticipants: fields.max_participants,
    }, before);
    await repository.updateEvent(before, write);
    const after = await repository.eventBySlug(fields.slug);
    if (!after || !sameEventUpdate(before, after, write)) {
      return managementRedirect(appBaseUrl, { error: "temporarily-unavailable" });
    }
    return managementRedirect(appBaseUrl, { notice: "event-updated" });
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
