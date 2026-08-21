import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deriveAccountContext } from "../../../../lib/auth/account-context";
import type { TosEvent } from "../../../../lib/tos/types";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const requirePlannerAccount = vi.hoisted(() => vi.fn());
const eventBySlug = vi.hoisted(() => vi.fn());
const plannerInputForEvent = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
const staffEventConstructor = vi.hoisted(() => vi.fn());
const plannerInputConstructor = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../lib/auth/route-guard", () => ({ requirePlannerAccount }));
vi.mock("../../../../lib/tos/staff-repository", () => ({
  StaffTosEventRepository: class {
    constructor(client: unknown) { staffEventConstructor(client); }
    eventBySlug = eventBySlug;
  },
}));
vi.mock("../../../../lib/tos/staff-planner-input-repository", () => ({
  StaffPlannerInputRepository: class {
    constructor(client: unknown) { plannerInputConstructor(client); }
    plannerInputForEvent = plannerInputForEvent;
  },
}));

import TosEventParticipantsPage from "./page";

const event: TosEvent = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "web5b1-padel",
  title: "WEB-5B1 Padel",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null,
  status: "closed",
});
const planner = deriveAccountContext(
  { userId: "user-planner", email: "planner@example.test" },
  { id: "user-planner", display_name: "Planner", role: "planner", active: true, member_id: null },
  null,
);

describe("staff participant detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const client = Object.freeze({ requestScoped: true });
    createServerSupabaseClient.mockResolvedValue(client);
    requirePlannerAccount.mockResolvedValue(planner);
    eventBySlug.mockResolvedValue(event);
    plannerInputForEvent.mockResolvedValue([]);
  });

  it("uses one request-scoped client, staff guard, server slug and server-read event id", async () => {
    render(await TosEventParticipantsPage({ params: Promise.resolve({ slug: event.slug }) }));
    const client = await createServerSupabaseClient.mock.results[0].value;
    expect(requirePlannerAccount).toHaveBeenCalledWith(client);
    expect(staffEventConstructor).toHaveBeenCalledWith(client);
    expect(plannerInputConstructor).toHaveBeenCalledWith(client);
    expect(eventBySlug).toHaveBeenCalledWith(event.slug);
    expect(plannerInputForEvent).toHaveBeenCalledWith(event.id);
    expect(screen.getByRole("heading", { name: event.title })).toBeVisible();
  });

  it("fails invalid or missing event slugs without calling the participant RPC", async () => {
    await expect(TosEventParticipantsPage({ params: Promise.resolve({ slug: "Unsafe Slug" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();

    eventBySlug.mockResolvedValueOnce(null);
    await expect(TosEventParticipantsPage({ params: Promise.resolve({ slug: event.slug }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(plannerInputForEvent).not.toHaveBeenCalled();
  });

  it("keeps event context and hides partial data when the RPC fails", async () => {
    plannerInputForEvent.mockRejectedValueOnce(new Error("private database detail"));
    render(await TosEventParticipantsPage({ params: Promise.resolve({ slug: event.slug }) }));
    expect(screen.getByRole("heading", { name: event.title })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Deelnemers zijn tijdelijk niet beschikbaar" })).toBeVisible();
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
  });
});
