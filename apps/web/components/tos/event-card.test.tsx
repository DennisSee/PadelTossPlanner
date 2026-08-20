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
};

const declined: OwnRegistration = {
  id: "22222222-2222-4222-8222-222222222222",
  eventId: event.id,
  response: "declined",
  availableFrom: null,
  availableUntil: null,
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

describe("participant TOS cards", () => {
  it("renders structured event information and escaped social names", () => {
    const { container } = render(
      <TosEventCard
        event={event}
        attendeeNames={["Dennis", "<img src=x onerror=alert(1)>"]}
        now={new Date("2026-08-20T12:00:00Z")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Vrijdag TOS" })).toBeInTheDocument();
    expect(screen.getByText(/2 deelnemers/u)).toHaveTextContent("Dennis");
    expect(screen.getByText(/2 deelnemers/u)).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Aanmelden" })).toHaveAttribute("href", "/tos/vrijdag-padel");
  });

  it("keeps declined rows visible as an editable own response", () => {
    render(
      <TosEventCard
        event={event}
        registration={declined}
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
});
