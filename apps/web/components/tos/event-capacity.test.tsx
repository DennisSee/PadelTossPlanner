import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventCapacityPanel } from "./event-capacity";

it.each(["padel", "tennis"] as const)("shows full capacity as information while retaining the waitlist count for %s", (sport) => {
  render(<EventCapacityPanel sport={sport} capacity={{ maxParticipants: 15, placedCount: 15, availableCount: 0, waitlistCount: 4 }} />);
  expect(screen.getByLabelText("15 van 15 plaatsen bezet")).toBeVisible();
  expect(screen.getByText("15 / 15")).toBeVisible();
  expect(screen.getByText("Vol")).toBeVisible();
  expect(screen.getByText("4 op wachtlijst")).toBeVisible();
  expect(screen.queryByText(/plekken vrij/)).not.toBeInTheDocument();
});

it("keeps exact occupancy and free places for a non-full event", () => {
  render(<EventCapacityPanel sport="padel" compact capacity={{ maxParticipants: 20, placedCount: 11, availableCount: 9, waitlistCount: 0 }} />);
  expect(screen.getByText("11 / 20")).toBeVisible();
  expect(screen.getByText("9 plekken vrij")).toBeVisible();
  expect(screen.queryByText("Vol")).not.toBeInTheDocument();
  expect(screen.queryByText(/op wachtlijst/)).not.toBeInTheDocument();
});

it.each([false, true])("keeps compact home capacity truthful when full=%s", (full) => {
  render(<EventCapacityPanel sport="padel" compact hideFreePlaces capacity={{ maxParticipants: 24, placedCount: full ? 24 : 4, availableCount: full ? 0 : 20, waitlistCount: full ? 3 : 0 }} />);
  expect(screen.getByText(full ? "24 / 24" : "4 / 24")).toBeVisible();
  expect(screen.getByText("Plekken bezet")).toBeVisible();
  expect(screen.queryByText(/plekken vrij/)).not.toBeInTheDocument();
  if (full) {
    expect(screen.getByText("Vol")).toBeVisible();
    expect(screen.getByText("3 op wachtlijst")).toBeVisible();
  }
});
