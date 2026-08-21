import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const updateEvent = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/tos/staff-repository")>();
  return { ...actual, StaffTosEventRepository: class { updateEvent = updateEvent; eventBySlug = eventBySlug; } };
});

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const client = Object.freeze({ requestScoped: true });
const event = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "padel-tos-20260828-a1b2c3d4",
  title: "Old",
  sport: "padel" as const,
  startsAt: "2026-08-28T18:00:00Z",
  endsAt: "2026-08-28T20:00:00Z",
  signupDeadline: null,
  status: "draft" as const,
  maxParticipants: 24,
};
const fields = { slug: event.slug, title: "New", signup_deadline: "2026-08-28T19:00", status: "open", max_participants: "32" };

function account(role: "participant" | "planner" | "admin" = "planner", active = true) {
  return {
    identity: { userId: "33333333-3333-4333-8333-333333333333", email: "staff@example.test" },
    profile: { displayName: "Staff", role, active, memberId: null },
    membership: { state: active ? "missing" : "inactive", memberId: null, displayName: null },
    capabilities: { canParticipate: false, canPlan: active && role !== "participant", canAdminister: active && role === "admin" },
  };
}

function request(values: Record<string, string>, origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new NextRequest(`${APP_BASE_URL}/api/beheer/tos/update`, {
    method: "POST", headers: origin ? { origin } : undefined, body: form,
  });
}

describe("staff event update POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(account());
    eventBySlug.mockResolvedValueOnce(event).mockResolvedValueOnce({
      ...event, title: "New", signupDeadline: "2026-08-28T17:00:00.000Z", status: "open", maxParticipants: 32,
    });
  });

  it("reloads the event and updates only mutable fields through the server-read event", async () => {
    const response = await POST(request(fields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?notice=event-updated`);
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client);
    expect(eventBySlug).toHaveBeenNthCalledWith(1, event.slug);
    expect(updateEvent).toHaveBeenCalledWith(event, {
      title: "New", signupDeadline: "2026-08-28T17:00:00.000Z", status: "open", maxParticipants: 32,
    });
    expect(eventBySlug).toHaveBeenNthCalledWith(2, event.slug);
  });

  it.each([null, "https://evil.example"])("rejects origin %s before Auth", async (origin) => {
    const response = await POST(request(fields, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["event_id", "sport", "starts_at", "ends_at", "created_by", "role", "member_id"])(
    "rejects immutable/authority field %s",
    async (field) => {
      const response = await POST(request({ ...fields, [field]: "attacker" }));
      expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?error=invalid-request`);
      expect(updateEvent).not.toHaveBeenCalled();
    },
  );

  it.each(["draft", "open", "closed", "cancelled"])("does not invent a transition rule for %s", async (status) => {
    eventBySlug.mockReset();
    eventBySlug.mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, title: "New", signupDeadline: null, status, maxParticipants: 32 });
    const response = await POST(request({ ...fields, signup_deadline: "", status }));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?notice=event-updated`);
  });

  it.each([account("participant"), account("planner", false)])("denies participant/inactive staff", async (denied) => {
    loadAccountContextWithClient.mockResolvedValueOnce(denied);
    const response = await POST(request(fields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account`);
    expect(eventBySlug).not.toHaveBeenCalled();
  });

  it("does not report success if immutable server fields change", async () => {
    eventBySlug.mockReset();
    eventBySlug.mockResolvedValueOnce(event).mockResolvedValueOnce({
      ...event, sport: "tennis", title: "New", signupDeadline: "2026-08-28T17:00:00Z", status: "open", maxParticipants: 32,
    });
    const response = await POST(request(fields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?error=temporarily-unavailable`);
  });
});
