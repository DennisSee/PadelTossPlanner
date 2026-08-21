import type { NextRequest } from "next/server";

import { privateAuthRedirect } from "../../../../lib/auth/finalize";
import { loginPathFor } from "../../../../lib/auth/return-path";
import { loadAccountContextWithClient } from "../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../lib/config/public-supabase";
import {
  TosConflictError,
  TosRepository,
} from "../../../../lib/tos/repository";
import {
  exactTextFields,
  hasExactOrigin,
  InvalidTosRequestError,
  noStoreResponse,
  tosRedirect,
} from "../../../../lib/tos/request";
import { isTosEventSlug, tosDetailPath } from "../../../../lib/tos/slug";
import {
  eventAllowsSelfService,
  InvalidAvailabilityError,
  normalizeAvailability,
} from "../../../../lib/tos/time";
import type { OwnRegistration, RegistrationWrite } from "../../../../lib/tos/types";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function sameTimestamp(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return new Date(left).getTime() === new Date(right).getTime();
}

function matchesWrite(registration: OwnRegistration, write: RegistrationWrite): boolean {
  return (
    registration.response === write.response &&
    sameTimestamp(registration.availableFrom, write.availableFrom) &&
    sameTimestamp(registration.availableUntil, write.availableUntil)
  );
}

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return noStoreResponse("Aanmelden is tijdelijk niet beschikbaar.", 503);
  }
  if (!hasExactOrigin(request, appBaseUrl)) {
    return noStoreResponse("Ongeldig verzoek.", 403);
  }

  let values: Readonly<Record<string, string>>;
  try {
    values = exactTextFields(await request.formData(), {
      slug: 80,
      response: 16,
      available_from: 5,
      available_until: 5,
    });
    if (
      !isTosEventSlug(values.slug) ||
      (values.response !== "attending" && values.response !== "declined")
    ) {
      throw new InvalidTosRequestError();
    }
  } catch {
    return tosRedirect(appBaseUrl, "/tos", { error: "invalid-request" });
  }
  const destination = tosDetailPath(values.slug);

  try {
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account) return privateAuthRedirect(loginPathFor(destination), appBaseUrl);
    if (!account.capabilities.canParticipate) {
      return tosRedirect(appBaseUrl, destination, { error: "not-authorized" });
    }
    const repository = new TosRepository(client);
    const event = await repository.eventBySlug(values.slug, { openOnly: false });
    if (!event || !eventAllowsSelfService(event)) {
      return tosRedirect(appBaseUrl, destination, { error: "self-service-closed" });
    }
    const existing = await repository.ownRegistration(
      event.id,
      account.identity.userId,
    );
    const write = normalizeAvailability(
      event,
      values.response,
      values.available_from,
      values.available_until,
    );
    if (existing) {
      await repository.updateRegistration(existing, account.identity.userId, write);
    } else {
      await repository.createRegistration(event.id, write);
    }
    const saved = await repository.ownRegistration(event.id, account.identity.userId);
    if (!saved || !matchesWrite(saved, write)) {
      return tosRedirect(appBaseUrl, destination, { error: "temporarily-unavailable" });
    }
    const notice = write.response === "declined"
      ? "registration-declined"
      : existing
        ? "registration-updated"
        : "registration-created";
    return tosRedirect(appBaseUrl, "/tos", { notice });
  } catch (error) {
    if (error instanceof TosConflictError) {
      return tosRedirect(appBaseUrl, destination, { error: "conflict" });
    }
    if (error instanceof InvalidAvailabilityError) {
      return tosRedirect(appBaseUrl, destination, { error: "invalid-request" });
    }
    return tosRedirect(appBaseUrl, destination, { error: "temporarily-unavailable" });
  }
}
