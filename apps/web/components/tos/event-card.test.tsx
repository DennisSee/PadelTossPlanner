import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OwnRegistration, TosEvent } from "../../lib/tos/types";
import { TosEventCard } from "./event-card";

const event: TosEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "vrijdag-padel",
  title: "Vrijdag TOS",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: "2026-08-21T17:00:00Z",
  status: "open",
  maxParticipants: 24,
};

const declined: OwnRegistration = {
  id: "22222222-2222-4222-8222-222222222222",
  eventId: event.id,
  response: "declined",
  availableFrom: null,
  availableUntil: null,
  attendingSince: null,
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

describe("participant TOS cards", () => {
  it("groups participant information and the primary action in one column", () => {
    render(
      <TosEventCard
        event={event}
        capacity={{ maxParticipants: 24, placedCount: 2, availableCount: 22, waitlistCount: 0 }}
        attendance={[
          { displayName: "Dennis", placementStatus: "placed", waitlistPosition: null },
          { displayName: "Jeroen", placementStatus: "placed", waitlistPosition: null },
        ]}
        now={new Date("2026-08-20T12:00:00Z")}
      />,
    );
    const preview = screen.getByText(/^2 deelnemers/u);
    const action = screen.getByRole("link", { name: /aanmelden/i });
    expect(preview.parentElement).toBe(action.parentElement?.parentElement);
  });

  it("renders structured event information and escaped social names", () => {
    const { container } = render(
      <TosEventCard
        event={event}
        capacity={{ maxParticipants: 24, placedCount: 2, availableCount: 22, waitlistCount: 0 }}
        attendance={[
          { displayName: "Dennis", placementStatus: "placed", waitlistPosition: null },
          { displayName: "<img src=x onerror=alert(1)>", placementStatus: "placed", waitlistPosition: null },
        ]}
        now={new Date("2026-08-20T12:00:00Z")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Padel TOS-avond" })).toBeInTheDocument();
    expect(screen.getByText("Vrijdag TOS", { selector: "p" })).toBeVisible();
    expect(screen.getByText("Padel", { selector: '[data-sport="padel"] span' })).toBeVisible();
    expect(container.querySelector('[data-sport="padel"] svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="2 van 24 plaatsen bezet"][data-sport="padel"]')).toBeInTheDocument();
    expect(screen.getByText(/2 deelnemers/u)).toHaveTextContent("Dennis");
    expect(screen.getByText(/2 deelnemers/u)).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Aanmelden" })).toHaveAttribute("href", "/tos/vrijdag-padel");
  });

  it("gives tennis its own textual, iconic and capacity identity", () => {
    const { container } = render(
      <TosEventCard
        event={{ ...event, sport: "tennis", slug: "zaterdag-tennis" }}
        capacity={{ maxParticipants: 24, placedCount: 0, availableCount: 24, waitlistCount: 0 }}
        attendance={[]}
        now={new Date("2026-08-20T12:00:00Z")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tennis TOS-avond" })).toBeVisible();
    expect(screen.getByText("Tennis", { selector: '[data-sport="tennis"] span' })).toBeVisible();
    expect(container.querySelector('[data-sport="tennis"] svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="0 van 24 plaatsen bezet"][data-sport="tennis"]')).toBeInTheDocument();
  });

  it("keeps declined rows visible as an editable own response", () => {
    render(
      <TosEventCard
        event={event}
        registration={declined}
        capacity={{ maxParticipants: 24, placedCount: 0, availableCount: 24, waitlistCount: 0 }}
        attendance={[]}
        now={new Date("2026-08-20T12:00:00Z")}
      />,
    );
    expect(screen.getByText("Afgemeld")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aanmelding wijzigen" })).toBeInTheDocument();
  });

  it("does not offer a misleading action after the deadline", () => {
    render(
      <TosEventCard
        event={event}
        registration={declined}
        capacity={{ maxParticipants: 24, placedCount: 0, availableCount: 24, waitlistCount: 0 }}
        attendance={[]}
        now={new Date("2026-08-21T17:00:01Z")}
      />,
    );
    expect(screen.getByText("Deze aanmelding kan niet meer worden gewijzigd.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Aanmelding wijzigen" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aanmelding bekijken" })).toHaveAttribute(
      "href",
      "/tos/vrijdag-padel",
    );
  });

  it("offers a waitlist CTA when an open event is full", () => {
    render(<TosEventCard
      event={{ ...event, maxParticipants: 2 }}
      capacity={{ maxParticipants: 2, placedCount: 2, availableCount: 0, waitlistCount: 1 }}
      attendance={[
        { displayName: "Dennis", placementStatus: "placed", waitlistPosition: null },
        { displayName: "Marieke", placementStatus: "placed", waitlistPosition: null },
        { displayName: "Peter", placementStatus: "waitlist", waitlistPosition: 1 },
      ]}
      now={new Date("2026-08-20T12:00:00Z")}
    />);
    expect(screen.getAllByText("2 / 2")[0]).toBeVisible();
    expect(screen.getByText("1 op wachtlijst")).toBeVisible();
    expect(screen.getByRole("link", { name: "Op wachtlijst" })).toHaveAttribute(
      "href",
      "/tos/vrijdag-padel",
    );
  });

  it("shows only the own derived waitlist position", () => {
    const attending = {
      ...declined,
      response: "attending" as const,
      availableFrom: event.startsAt,
      availableUntil: event.endsAt,
      attendingSince: "2026-08-20T10:00:00Z",
    };
    render(<TosEventCard
      event={{ ...event, maxParticipants: 2 }}
      registration={attending}
      registrationPosition={{ placementStatus: "waitlist", waitlistPosition: 2 }}
      capacity={{ maxParticipants: 2, placedCount: 2, availableCount: 0, waitlistCount: 2 }}
      attendance={[]}
      now={new Date("2026-08-20T12:00:00Z")}
    />);
    expect(screen.getByText("Wachtlijst · plek 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "Aanmelding wijzigen" })).toBeVisible();
  });
});
