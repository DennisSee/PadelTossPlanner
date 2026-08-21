import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerWorkspace } from "./planner-workspace";

const event = Object.freeze({
  slug: "vrijdag-padel", title: "Vrijdag Padel", sport: "padel" as const,
  startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null, status: "closed" as const,
  maxParticipants: 24,
});

const draft = Object.freeze({
  players: [Object.freeze({
    rowId: "11111111-1111-4111-8111-111111111111", name: "Ada", ranking: 4,
    included: true, availableFrom: "20:00", availableUntil: "22:00", linked: true,
  })],
  selectedCourts: ["Kremer Baan" as const], matchMinutes: 20 as const, restMinutes: 0,
  searchProfile: "Normaal" as const, allowRepeatPartners: false, levelMix: 50,
  teamDifferenceTolerance: 0.5, revision: 2, updatedByName: "Planner",
  updatedAt: "2026-08-21T16:00:00Z",
});

describe("PlannerWorkspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders only editor-safe player data and marks unsaved edits", () => {
    const { container } = render(<PlannerWorkspace event={event} draft={draft} importPreview={[]} schedules={[]} selectedSchedule={null} />);
    expect(screen.getByDisplayValue("Ada")).toBeVisible();
    expect(container.innerHTML).not.toMatch(/member_id|user_id|registration_id|source_event_id/u);
    const generate = screen.getByRole("button", { name: "Schema genereren" });
    expect(generate).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue("Ada"), { target: { value: "Ada A." } });
    expect(screen.getByText(/Niet-opgeslagen wijzigingen/u)).toBeVisible();
    expect(generate).toBeDisabled();
  });

  it("sends only slug and stored revision to the generation route", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      seed: 19,
      schedule: [{ Ronde: 1, Tijd: "20:00 - 20:20", Baan: "Kremer Baan", "Team 1": "Ada & Bea", "Niveau T1": 3, "Team 2": "Cleo & Dora", "Niveau T2": 3, Teamverschil: 0, Rust: "Niemand", "Nog niet aanwezig": "Niemand", "Niet meer beschikbaar": "Niemand" }],
      statistics: [], diagnostics: { rounds: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<PlannerWorkspace event={event} draft={draft} importPreview={[]} schedules={[]} selectedSchedule={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Schema genereren" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Controleer het voorstel" })).toBeVisible());
    expect(screen.getByText("Plannerdiagnostiek")).toBeVisible();
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ slug: event.slug, expected_revision: 2 });
    expect(String(options.body)).not.toContain("Ada");
    const save = screen.getByRole("button", { name: "Dit schema privé opslaan" }).closest("form");
    expect(new FormData(save!)).toEqual(expect.any(FormData));
    expect((save!.querySelector('[name="generation_seed"]') as HTMLInputElement).value).toBe("19");
    expect(save!.querySelector('[name="schedule"]')).toBeNull();
    fireEvent.change(screen.getByDisplayValue("Ada"), { target: { value: "Ada gewijzigd" } });
    expect(screen.queryByRole("heading", { name: "Controleer het voorstel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dit schema privé opslaan" })).not.toBeInTheDocument();
  });

  it("shows event-scoped private schedule detail without identity metadata", () => {
    const { container } = render(<PlannerWorkspace
      event={event} draft={draft} importPreview={[]}
      schedules={[{ id: "22222222-2222-4222-8222-222222222222", createdByName: "Planner", isPublished: false, generationSeed: 9, plannerDraftRevision: 2, createdAt: "2026-08-21T16:00:00Z", canPublish: true }]}
      selectedSchedule={{
        id: "22222222-2222-4222-8222-222222222222", title: event.title, eventDate: "2026-08-21",
        startTime: "20:00", endTime: "22:00", matchMinutes: 20, courts: ["Kremer Baan"],
        schedule: [{ Ronde: 1, Tijd: "20:00 - 20:20", Baan: "Kremer Baan", "Team 1": "Ada & Bea", "Niveau T1": 3, "Team 2": "Cleo & Dora", "Niveau T2": 3, Teamverschil: 0, Rust: "Niemand", "Nog niet aanwezig": "Niemand", "Niet meer beschikbaar": "Niemand" }],
        statistics: [{ Speler: "Ada", Ranking: 4 }], diagnostics: { rounds: 1 },
      }}
    />);
    expect(screen.getByRole("heading", { name: "Opgeslagen schema controleren" })).toBeVisible();
    expect(screen.getByText(/Niveau 3 – 3/u)).toBeVisible();
    expect(container.innerHTML).not.toMatch(/member_id|user_id|registration_id|players_private/u);
  });
});
