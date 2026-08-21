import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TosEventParticipants } from "./tos-event-participants";
import type { StaffPlannerInput, TosEvent } from "../../lib/tos/types";

const padelEvent: TosEvent = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "web5b1-padel",
  title: "WEB-5B1 Padelavond",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: "2026-08-21T17:00:00Z",
  status: "closed",
});

let counter = 1;
function participant(
  displayName: string,
  overrides: Partial<StaffPlannerInput> = {},
): StaffPlannerInput {
  const suffix = String(counter++).padStart(12, "0");
  return Object.freeze({
    registrationId: `10000000-0000-4000-8000-${suffix}`,
    userId: `20000000-0000-4000-8000-${suffix}`,
    memberId: `30000000-0000-4000-8000-${suffix}`,
    response: "attending",
    availableFrom: padelEvent.startsAt,
    availableUntil: padelEvent.endsAt,
    registrationUpdatedAt: "2026-08-20T10:00:00Z",
    displayName,
    approvalStatus: "approved",
    memberActive: true,
    sportProfileActive: true,
    ranking: 4,
    ...overrides,
  });
}

describe("staff event participant presentation", () => {
  it("shows event context, counts, every finite readiness label and safe rows", () => {
    const participants = [
      participant("Hele Avond"),
      participant("Partieel", { availableFrom: "2026-08-21T18:07:00Z", availableUntil: "2026-08-21T19:43:00Z" }),
      participant("Pending", { approvalStatus: "pending" }),
      participant("Rejected", { approvalStatus: "rejected" }),
      participant("Inactief lid", { memberActive: false }),
      participant("Inactief profiel", { sportProfileActive: false }),
      participant("Geen niveau", { ranking: null }),
      participant("Ongeldige tijd", { availableFrom: null }),
      participant("Afgemelde speler", { response: "declined", availableFrom: null, availableUntil: null }),
    ];
    const { container } = render(<TosEventParticipants event={padelEvent} participants={participants} />);
    expect(screen.getByRole("heading", { name: "WEB-5B1 Padelavond" })).toBeVisible();
    expect(screen.getByText("PADEL")).toBeVisible();
    expect(screen.getByText(/vrijdag 21 augustus 2026 · 20:00–22:00/u)).toBeVisible();
    expect(screen.getByText(/Inschrijfdeadline: vrijdag 21 augustus 2026 · 19:00/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "← Terug naar beheer" })).toHaveAttribute("href", "/beheer");
    expect(screen.getByRole("link", { name: "Eventpagina bekijken" })).toHaveAttribute("href", "/tos/web5b1-padel");

    const summary = screen.getByLabelText("Deelnemerssamenvatting");
    for (const [label, value] of [
      ["Totaal reacties", "9"], ["Doet mee", "8"], ["Afgemeld", "1"],
      ["Klaar voor planner", "2"], ["Aandacht nodig", "6"],
    ]) {
      const card = within(summary).getByText(label).closest("section")!;
      expect(within(card).getByText(value)).toBeVisible();
    }
    for (const label of [
      "Klaar voor planner", "Goedkeuring in behandeling", "Lidmaatschap niet goedgekeurd",
      "Clublid inactief", "Padelprofiel inactief", "Padelniveau ontbreekt",
      "Beschikbaarheid ongeldig", "Afgemeld",
    ]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hele avond").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20:07–21:43").length).toBeGreaterThan(0);

    const preview = screen.getByRole("heading", { name: "Plannerinput" }).closest("section")!;
    expect(within(preview).getByText("Hele Avond")).toBeVisible();
    expect(within(preview).getByText("Partieel")).toBeVisible();
    for (const blocked of ["Pending", "Rejected", "Inactief lid", "Geen niveau", "Afgemelde speler"]) {
      expect(within(preview).queryByText(blocked)).not.toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/example\.test|10000000-|20000000-|30000000-/u);
    expect(container.querySelector("input, select, textarea, button, form")).not.toBeInTheDocument();
  });

  it("uses event-specific tennis ranking without claiming planner support", () => {
    const tennisEvent = { ...padelEvent, sport: "tennis", slug: "web5b1-tennis", title: "WEB-5B1 Tennis" } as const;
    render(<TosEventParticipants event={tennisEvent} participants={[
      participant("Dubbele sporter", { ranking: 2 }),
    ]} />);
    expect(screen.getByText("Tennisniveau")).toBeVisible();
    expect(screen.getByText("Gegevens compleet")).toBeVisible();
    expect(screen.getByText("Tennisplanner wordt in een volgende stap toegevoegd.")).toBeVisible();
    expect(screen.queryByText("Klaar voor planner")).not.toBeInTheDocument();
    expect(screen.queryByText("Padelniveau 4")).not.toBeInTheDocument();
  });

  it("keeps event context visible for a controlled repository failure", () => {
    render(<TosEventParticipants event={padelEvent} participants={null} />);
    expect(screen.getByRole("heading", { name: "WEB-5B1 Padelavond" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Deelnemers zijn tijdelijk niet beschikbaar" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Doet mee" })).not.toBeInTheDocument();
  });
});
