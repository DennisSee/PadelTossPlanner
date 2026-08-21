import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const ownRegistration = vi.hoisted(() => vi.fn());
const createRegistration = vi.hoisted(() => vi.fn());
const updateRegistration = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../lib/tos/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/tos/repository")>();
  return {
    ...actual,
    TosRepository: class {
      eventBySlug = eventBySlug;
      ownRegistration = ownRegistration;
      createRegistration = createRegistration;
      updateRegistration = updateRegistration;
    },
  };
});

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const client = Object.freeze({ client: "same-request-client" });
const event = {
  id: EVENT_ID,
  slug: "vrijdag-padel",
  title: "Vrijdag TOS",
  sport: "padel" as const,
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null,
  status: "open" as const,
};
const saved = {
  id: REGISTRATION_ID,
  eventId: EVENT_ID,
  response: "attending" as const,
  availableFrom: "2026-08-21T18:07:00.000Z",
  availableUntil: "2026-08-21T19:43:00.000Z",
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

function account(canParticipate = true) {
  return {
    identity: { userId: USER_ID, email: "member@example.test" },
    profile: { displayName: "Dennis", role: "admin", active: true, memberId: "member-1" },
    membership: { state: canParticipate ? "approved" : "pending", memberId: "member-1", displayName: "Dennis" },
    capabilities: { canParticipate, canPlan: true, canAdminister: true },
  };
}

function request(fields: Record<string, string>, origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const headers = origin ? { origin } : undefined;
  return new NextRequest(`${APP_BASE_URL}/api/tos/registration`, { method: "POST", headers, body: form });
}

const attendingFields = {
  slug: "vrijdag-padel",
  response: "attending",
  available_from: "20:07",
  available_until: "21:43",
};

describe("registration POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(account());
    eventBySlug.mockResolvedValue(event);
    ownRegistration.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    createRegistration.mockResolvedValue(saved);
    updateRegistration.mockResolvedValue(saved);
  });

  it("rechecks account, event and own row on one client before and after create", async () => {
    const response = await POST(request(attendingFields));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?notice=registration-created`);
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client);
    expect(eventBySlug).toHaveBeenCalledWith("vrijdag-padel", { openOnly: false });
    expect(ownRegistration).toHaveBeenNthCalledWith(1, EVENT_ID, USER_ID);
    expect(createRegistration).toHaveBeenCalledWith(EVENT_ID, {
      response: "attending",
      availableFrom: "2026-08-21T18:07:00.000Z",
      availableUntil: "2026-08-21T19:43:00.000Z",
    });
    expect(ownRegistration).toHaveBeenNthCalledWith(2, EVENT_ID, USER_ID);
  });

  it("returns to the TOS overview after updating an attending registration", async () => {
    ownRegistration.mockReset();
    ownRegistration.mockResolvedValueOnce(saved).mockResolvedValueOnce(saved);
    const response = await POST(request(attendingFields));
    expect(updateRegistration).toHaveBeenCalledWith(saved, USER_ID, {
      response: "attending",
      availableFrom: "2026-08-21T18:07:00.000Z",
      availableUntil: "2026-08-21T19:43:00.000Z",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?notice=registration-updated`);
  });

  it("updates only the server-read own registration and supports declined", async () => {
    const declined = { ...saved, response: "declined" as const, availableFrom: null, availableUntil: null };
    ownRegistration.mockReset();
    ownRegistration.mockResolvedValueOnce(saved).mockResolvedValueOnce(declined);
    updateRegistration.mockResolvedValueOnce(declined);
    const response = await POST(request({ ...attendingFields, response: "declined" }));
    expect(updateRegistration).toHaveBeenCalledWith(saved, USER_ID, {
      response: "declined",
      availableFrom: null,
      availableUntil: null,
    });
    expect(createRegistration).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?notice=registration-declined`);
  });

  it("keeps the event detail as the anonymous login return", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce(null);
    const response = await POST(request(attendingFields));
    expect(response.status).toBe(303);
    expect(response.headers.get("location"))
      .toBe(`${APP_BASE_URL}/login?next=%2Ftos%2Fvrijdag-padel`);
    expect(eventBySlug).not.toHaveBeenCalled();
  });

  it.each([null, "https://evil.example"])("rejects origin %s", async (origin) => {
    const response = await POST(request(attendingFields, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["user_id", "member_id", "event_id", "registration_id", "source", "role"])(
    "rejects client authority field %s",
    async (field) => {
      const response = await POST(request({ ...attendingFields, [field]: "attacker" }));
      expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos?error=invalid-request`);
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it("blocks a valid session without membership capability", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce(account(false));
    const response = await POST(request(attendingFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos/vrijdag-padel?error=not-authorized`);
    expect(eventBySlug).not.toHaveBeenCalled();
  });

  it.each([
    { ...event, status: "closed" as const },
    { ...event, status: "cancelled" as const },
    { ...event, signupDeadline: "2020-01-01T00:00:00Z" },
  ])("blocks self-service for a closed database boundary", async (closedEvent) => {
    eventBySlug.mockResolvedValueOnce(closedEvent);
    const response = await POST(request(attendingFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos/vrijdag-padel?error=self-service-closed`);
    expect(createRegistration).not.toHaveBeenCalled();
  });

  it("does not navigate as success when the post-write read differs", async () => {
    ownRegistration.mockReset();
    ownRegistration.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...saved, availableUntil: "2026-08-21T19:44:00Z" });
    const response = await POST(request(attendingFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/tos/vrijdag-padel?error=temporarily-unavailable`);
  });
});
