import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CreateTosEventForm, TosEventList } from "./tos-event-management";
import type { TosEvent } from "../../lib/tos/types";

const event: TosEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "padel-tos-20260828-a1b2c3d4",
  title: "TOS vrijdag",
  sport: "padel",
  startsAt: "2026-08-28T18:00:00Z",
  endsAt: "2026-08-28T20:00:00Z",
  signupDeadline: "2026-08-28T17:00:00Z",
  status: "draft",
};

describe("TOS event management UI", () => {
  it("renders the exact create fields and Amsterdam defaults without authority inputs", () => {
    const { container } = render(<CreateTosEventForm now={new Date("2026-08-20T10:00:00Z")} />);
    const form = container.querySelector('form[action="/api/beheer/tos/create"]')!;
    expect(form).toBeInTheDocument();
    expect([...form.querySelectorAll("[name]")].map((node) => node.getAttribute("name"))).toEqual([
      "title", "sport", "event_date", "starts_at", "ends_at", "signup_deadline", "status",
    ]);
    expect(screen.getByLabelText("Titel")).toHaveValue("TOS-avond");
    expect(screen.getByLabelText("Datum")).toHaveValue("2026-08-27");
    expect(screen.getByLabelText("Starttijd")).toHaveAttribute("step", "300");
    expect(form.textContent).not.toMatch(/created_by|member_id|user_id/u);
  });

  it("shows safe event metadata, link and only mutable update inputs", () => {
    const { container } = render(<TosEventList events={[event, { ...event, id: "22222222-2222-4222-8222-222222222222", slug: "tennis-tos-20260828-deadbeef", sport: "tennis", status: "cancelled" }]} />);
    expect(screen.getAllByText("TOS vrijdag", { selector: "h3" })).toHaveLength(2);
    expect(screen.getAllByText("PADEL")).toHaveLength(1);
    expect(screen.getByText("Concept", { selector: "span" })).toBeVisible();
    expect(screen.getByText("Geannuleerd", { selector: "span" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Eventpagina bekijken" })[0])
      .toHaveAttribute("href", "/tos/padel-tos-20260828-a1b2c3d4");
    const update = container.querySelector<HTMLFormElement>('form[action="/api/beheer/tos/update"]')!;
    expect([...update.querySelectorAll("[name]")].map((node) => node.getAttribute("name"))).toEqual([
      "slug", "title", "signup_deadline", "status",
    ]);
    expect(within(update).queryByLabelText("Sport")).not.toBeInTheDocument();
    expect(within(update).queryByLabelText("Starttijd")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verwijder|delete/u })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/aanmeldingen|deelnemers|ranking/u);
  });
});
