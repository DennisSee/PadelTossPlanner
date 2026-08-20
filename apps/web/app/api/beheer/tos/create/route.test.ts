import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const createEvent = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/staff-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/tos/staff-repository")>();
  return { ...actual, StaffTosEventRepository: class { createEvent = createEvent; eventBySlug = eventBySlug; } };
});

import { POST } from "./route";

const APP_BASE_URL = "https://app.example";
const client = Object.freeze({ requestScoped: true });
let storedWrite: Record<string, unknown> | null;

function account(role: "participant" | "planner" | "admin" = "planner", active = true) {
  return {
    identity: { userId: "33333333-3333-4333-8333-333333333333", email: "staff@example.test" },
    profile: { displayName: "Staff", role, active, memberId: null },
    membership: { state: active ? "missing" : "inactive", memberId: null, displayName: null },
    capabilities: { canParticipate: false, canPlan: active && role !== "participant", canAdminister: active && role === "admin" },
  };
}

const validFields = {
  title: "TOS vrijdag",
  sport: "padel",
  event_date: "2026-08-28",
  starts_at: "20:07",
  ends_at: "22:00",
  signup_deadline: "2026-08-28T19:00",
  status: "draft",
};

function request(fields: Record<string, string>, origin: string | null = APP_BASE_URL) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`${APP_BASE_URL}/api/beheer/tos/create`, {
    method: "POST", headers: origin ? { origin } : undefined, body: form,
  });
}

describe("staff event create POST boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedWrite = null;
    readAppBaseUrl.mockReturnValue(APP_BASE_URL);
    createServerSupabaseClient.mockResolvedValue(client);
    loadAccountContextWithClient.mockResolvedValue(account());
    createEvent.mockImplementation(async (write) => { storedWrite = write; });
    eventBySlug.mockImplementation(async (slug) => storedWrite ? {
      id: "11111111-1111-4111-8111-111111111111",
      slug,
      title: storedWrite.title,
      sport: storedWrite.sport,
      startsAt: storedWrite.startsAt,
      endsAt: storedWrite.endsAt,
      signupDeadline: storedWrite.signupDeadline,
      status: storedWrite.status,
    } : null);
  });

  it.each(["planner", "admin"] as const)("allows active %s without membership on one client", async (role) => {
    loadAccountContextWithClient.mockResolvedValueOnce(account(role));
    const response = await POST(request(validFields));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?notice=event-created`);
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client);
    expect(createEvent).toHaveBeenCalledTimes(1);
    const write = createEvent.mock.calls[0][0];
    expect(Object.keys(write).sort()).toEqual([
      "endsAt", "signupDeadline", "slug", "sport", "startsAt", "status", "title",
    ]);
    expect(write.slug).toMatch(/^padel-tos-20260828-[0-9a-f]{8}$/u);
    expect(eventBySlug).toHaveBeenCalledWith(write.slug);
  });

  it.each([null, "https://evil.example"])("rejects origin %s before Auth", async (origin) => {
    const response = await POST(request(validFields, origin));
    expect(response.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["slug", "created_by", "id", "user_id", "member_id", "role", "created_at"])(
    "rejects forged field %s before repository use",
    async (field) => {
      const response = await POST(request({ ...validFields, [field]: "attacker" }));
      expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?error=invalid-request`);
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    account("participant"),
    account("planner", false),
    account("admin", false),
  ])("denies non-staff or inactive staff without attempting a write", async (denied) => {
    loadAccountContextWithClient.mockResolvedValueOnce(denied);
    const response = await POST(request(validFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/account`);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("redirects a missing session to the fixed management login", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce(null);
    const response = await POST(request(validFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/login?next=%2Fbeheer`);
  });

  it("does not report success when the defensive reread differs", async () => {
    eventBySlug.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111", slug: "different", title: "Changed",
      sport: "padel", startsAt: "2026-08-28T18:07:00Z", endsAt: "2026-08-28T20:00:00Z",
      signupDeadline: null, status: "draft",
    });
    const response = await POST(request(validFields));
    expect(response.headers.get("location")).toBe(`${APP_BASE_URL}/beheer?error=temporarily-unavailable`);
  });
});
