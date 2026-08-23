import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryPage } from "./history-page";

const memberId = "22222222-2222-4222-8222-222222222222";
const event = { eventId: "11111111-1111-4111-8111-111111111111", title: "Padel vrijdag", sport: "padel" as const, startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T20:00:00Z", matchCount: 1, restCount: 0, rounds: [{ roundNumber: 1, startsAt: "2026-08-21T18:00:00Z", endsAt: "2026-08-21T18:20:00Z", state: "playing" as const, courtName: "Kremer Baan", partners: [{ memberId, displayName: "Anna" }], opponents: [{ memberId: null, displayName: "Gast" }] }] };
const clubmate = { memberId, displayName: "Anna", sharedMatches: 1, sharedEvents: 1, lastSharedAt: "2026-08-21T20:00:00Z" };

describe("participant history UI", () => {
  it("shows official rounds and privacy-bounded clubmate contact actions", () => {
    const { container } = render(<HistoryPage events={[event]} years={[2026]} filters={{ year: 2026, sport: null, query: "" }} summary={{ evenings: 1, matches: 1, clubmates: 1, mostPlayed: { displayName: "Anna", matches: 1 } }} clubmates={[{ clubmate, shared: [{ eventId: event.eventId, title: event.title, sport: "padel", startsAt: event.startsAt, sharedMatches: 1 }], contact: null, email: null }]} />);
    container.querySelector("details")?.setAttribute("open", "");
    expect(screen.getByRole("heading", { name: "Padel vrijdag" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Vaak mee gespeeld" })).toBeVisible();
    expect(screen.getByText("21", { selector: "time strong" })).toBeVisible();
    expect(screen.getByText("Kremer Baan")).toBeInTheDocument();
    expect(screen.getAllByText(/Laatst samen/u).length).toBeGreaterThan(0);
    expect(screen.getByText("Lid van T.C. Zuid TOS", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Geen contact gedeeld", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bekijk gedeelde historie" })).toBeVisible();
    expect(container.querySelector('[name="other_member_id"]')).toHaveValue(memberId);
    expect(container.textContent).not.toContain("@");
  });

  it("renders an accepted e-mail only for an accepted relationship", () => {
    render(<HistoryPage events={[]} years={[]} filters={{ year: null, sport: null, query: "" }} summary={{ evenings: 0, matches: 0, clubmates: 0, mostPlayed: null }} clubmates={[{ clubmate, shared: [], contact: { requestId: "33333333-3333-4333-8333-333333333333", otherMemberId: memberId, displayName: "Anna", status: "accepted", direction: "outgoing", createdAt: event.startsAt, respondedAt: event.endsAt }, email: "anna@example.test" }]} />);
    expect(screen.getByRole("link", { name: "anna@example.test", hidden: true })).toHaveAttribute("href", "mailto:anna@example.test");
  });

  it("keeps duplicate display names identity-separated", () => {
    const otherMemberId = "44444444-4444-4444-8444-444444444444";
    const { container } = render(<HistoryPage events={[]} years={[]} filters={{ year: null, sport: null, query: "" }} summary={{ evenings: 0, matches: 0, clubmates: 2, mostPlayed: null }} clubmates={[
      { clubmate, shared: [], contact: null, email: null },
      { clubmate: { ...clubmate, memberId: otherMemberId }, shared: [], contact: null, email: null },
    ]} />);
    expect(screen.getAllByRole("heading", { name: "Anna", level: 3 })).toHaveLength(2);
    expect([...container.querySelectorAll('[name="other_member_id"]')].map((input) => input.getAttribute("value"))).toEqual([memberId, otherMemberId]);
  });

  it("shows calm empty states without inventing history or clubmates", () => {
    render(<HistoryPage events={[]} years={[]} filters={{ year: null, sport: null, query: "" }} summary={{ evenings: 0, matches: 0, clubmates: 0, mostPlayed: null }} clubmates={[]} />);
    expect(screen.getByRole("heading", { name: "Nog geen TOS-historie" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Bekijk komende TOS-avonden" })).toHaveAttribute("href", "/tos");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
  });
});
