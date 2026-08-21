import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ParticipantsSheet } from "./participants-sheet";
import type { TosEvent } from "../../lib/tos/types";

const event: TosEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "web6-padel",
  title: "Vrijdag TOS",
  sport: "padel",
  startsAt: "2026-08-21T18:00:00Z",
  endsAt: "2026-08-21T20:00:00Z",
  signupDeadline: null,
  status: "open",
  maxParticipants: 2,
};

describe("accessible participant sheet", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) { this.open = true; }),
    });
  });

  it("shows placed and waitlist names with no private participant fields", () => {
    const { container } = render(<ParticipantsSheet
      event={event}
      capacity={{ maxParticipants: 2, placedCount: 2, availableCount: 0, waitlistCount: 1 }}
      attendance={[
        { displayName: "Dennis", placementStatus: "placed", waitlistPosition: null },
        { displayName: "<img src=x onerror=alert(1)>", placementStatus: "placed", waitlistPosition: null },
        { displayName: "Marieke", placementStatus: "waitlist", waitlistPosition: 1 },
      ]}
    />);
    fireEvent.click(screen.getByRole("button", { name: /Bekijk deelnemers/u }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Deelnemers (2)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Wachtlijst (1)" })).toBeVisible();
    expect(screen.getByText("Marieke")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Sluiten" })).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toMatch(/user_id|member_id|ranking|available_from|example\.test/u);
  });

  it("does not render a redundant waitlist section when nobody waits", () => {
    render(<ParticipantsSheet
      event={event}
      capacity={{ maxParticipants: 2, placedCount: 1, availableCount: 1, waitlistCount: 0 }}
      attendance={[{ displayName: "Dennis", placementStatus: "placed", waitlistPosition: null }]}
    />);
    expect(screen.queryByRole("heading", { name: /Wachtlijst/u })).not.toBeInTheDocument();
  });
});
