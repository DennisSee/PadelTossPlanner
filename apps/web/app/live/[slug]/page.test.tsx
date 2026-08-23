import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
const loadEventPublicSchedule = vi.hoisted(() => vi.fn());
const loadOptionalAccountContext = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("../../../lib/supabase/public-schedule-repository", () => ({ loadEventPublicSchedule }));
vi.mock("../../../lib/auth/session", () => ({ loadOptionalAccountContext }));

import EventLivePage from "./page";

const schedule = {
  id: "schedule-1", eventSlug: "padel-live", eventTitle: "Padel TOS", eventSport: "padel" as const,
  eventStartsAt: "2026-08-23T18:00:00Z", eventEndsAt: "2026-08-23T20:00:00Z", eventDate: "2026-08-23",
  createdByName: "Planner", startTime: "20:00", endTime: "22:00", courts: ["Kremer Baan"], participants: [], rows: [],
  isPublished: true as const, createdAt: "2026-08-23T17:00:00Z",
};

describe("canonical event live page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOptionalAccountContext.mockResolvedValue(null);
    loadEventPublicSchedule.mockResolvedValue(schedule);
  });

  it("laadt uitsluitend de gevalideerde slug en rendert de eventtitel", async () => {
    render(await EventLivePage({ params: Promise.resolve({ slug: "padel-live" }) }));
    expect(loadEventPublicSchedule).toHaveBeenCalledWith("padel-live");
    expect(screen.getByRole("heading", { name: "Padel TOS" })).toBeVisible();
  });

  it("levert een veilige lege status voor unpublished/onbekend en geen sluglookup voor invalid input", async () => {
    loadEventPublicSchedule.mockResolvedValueOnce(null);
    render(await EventLivePage({ params: Promise.resolve({ slug: "niet-gepubliceerd" }) }));
    expect(screen.getByText("Er is nog geen gepubliceerd TOS-schema.")).toBeVisible();
    await expect(EventLivePage({ params: Promise.resolve({ slug: "Unsafe Slug" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadEventPublicSchedule).toHaveBeenCalledTimes(1);
  });
});
