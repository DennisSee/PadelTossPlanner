import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ account: vi.fn(), event: vi.fn(), own: vi.fn(), position: vi.fn() }));
vi.mock("../../../../lib/auth/session", () => ({ loadAccountContextWithClient: mocks.account }));
vi.mock("../../../../lib/config/public-supabase", () => ({ readAppBaseUrl: () => "https://tos.example.test" }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("../../../../lib/tos/repository", () => ({ TosRepository: class { eventBySlug = mocks.event; ownRegistration = mocks.own; ownRegistrationPosition = mocks.position; } }));
const context = { params: Promise.resolve({ slug: "test-avond" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({ capabilities: { canParticipate: true }, identity: { userId: "own-user" } });
  mocks.event.mockResolvedValue({ id: "own-event", slug: "test-avond", title: "TOS", status: "open", startsAt: "2026-09-07T18:00:00Z", endsAt: "2026-09-07T20:00:00Z" });
  mocks.own.mockResolvedValue({ response: "attending" });
  mocks.position.mockResolvedValue({ placementStatus: "placed" });
});
it("downloads a private calendar with safe filename and own scoped read", async () => {
  const response = await GET(new Request("https://evil.example/"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="test-avond.ics"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).toContain("URL:https://tos.example.test/tos/test-avond");
  expect(mocks.own).toHaveBeenCalledWith("own-event", "own-user");
});
it.each([null, { capabilities: { canParticipate: false } }])("does not reveal event data to nonparticipants", async (account) => {
  mocks.account.mockResolvedValue(account);
  expect((await GET(new Request("https://tos.example.test"), context)).status).toBe(404);
  expect(mocks.event).not.toHaveBeenCalled();
});
it.each(["waitlist", "declined"])("does not export an unconfirmed registration", async (placementStatus) => {
  mocks.position.mockResolvedValue({ placementStatus });
  expect((await GET(new Request("https://tos.example.test"), context)).status).toBe(404);
});
it("never leaks raw failures", async () => {
  mocks.event.mockRejectedValue(new Error("private SQL"));
  const response = await GET(new Request("https://tos.example.test"), context);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SQL");
});
