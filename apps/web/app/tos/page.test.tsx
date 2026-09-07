import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveAccountContext } from "../../lib/auth/account-context";
import TosPage from "./page";

const mocks = vi.hoisted(() => ({
  requireAccount: vi.fn(), listParticipantEvents: vi.fn(),
  listOwnUpcomingRegistrations: vi.fn(), eventCapacity: vi.fn(),
  eventAttendance: vi.fn(), ownRegistrationPosition: vi.fn(),
}));
vi.mock("../../lib/auth/route-guard", () => ({ requireAccount: mocks.requireAccount }));
vi.mock("../../lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(() => ({})) }));
vi.mock("../../lib/tos/repository", () => ({ TosRepository: class {
  listParticipantEvents = mocks.listParticipantEvents;
  listOwnUpcomingRegistrations = mocks.listOwnUpcomingRegistrations;
  eventCapacity = mocks.eventCapacity;
  eventAttendance = mocks.eventAttendance;
  ownRegistrationPosition = mocks.ownRegistrationPosition;
} }));

describe("participant TOS status overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccount.mockResolvedValue(deriveAccountContext(
      { userId: "user-1", email: "member@example.test" },
      { id: "user-1", display_name: "Member", role: "participant", active: true, member_id: "member-1" },
      { id: "member-1", display_name: "Member", approval_status: "approved", active: true },
    ));
    mocks.listParticipantEvents.mockResolvedValue([]);
    mocks.listOwnUpcomingRegistrations.mockResolvedValue([]);
  });

  it.each([
    ["open", "Geen open TOS-avonden gevonden.", false],
    ["closed", "Geen TOS-avonden met gesloten inschrijving gevonden.", false],
    ["past", "Geen afgelopen TOS-avonden gevonden.", true],
    ["all", "Geen TOS-avonden gevonden met deze filters.", true],
  ])("renders the %s empty state and appropriate query scope", async (status, message, includePast) => {
    render(await TosPage({ searchParams: Promise.resolve({ status: String(status) }) }));
    expect(screen.getByText(String(message))).toBeVisible();
    expect(screen.getByRole("option", { name: "Inschrijving gesloten" })).toHaveValue("closed");
    expect(screen.getByRole("option", { name: "Afgelopen" })).toHaveValue("past");
    expect(mocks.listParticipantEvents).toHaveBeenCalledWith(expect.any(Date), { includePast });
  });

  it.each(["past", "all"])("renders past safe event data under %s without social RPCs or signup actions", async (status) => {
    mocks.listParticipantEvents.mockResolvedValue([{
      id: "past-1", slug: "afgelopen-padel", title: "Eerdere clubavond", sport: "padel",
      status: "open", signupDeadline: null, maxParticipants: 24,
      startsAt: "2020-08-21T18:00:00Z", endsAt: "2020-08-21T20:00:00Z",
    }]);
    render(await TosPage({ searchParams: Promise.resolve({ status }) }));
    expect(screen.getByRole("heading", { name: "Eerdere clubavond" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Aanmelden" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bekijk deelnemers" })).not.toBeInTheDocument();
    expect(mocks.eventCapacity).not.toHaveBeenCalled();
    expect(mocks.eventAttendance).not.toHaveBeenCalled();
    expect(mocks.ownRegistrationPosition).not.toHaveBeenCalled();
  });
});
