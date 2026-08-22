import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TosFilters } from "./tos-filters";

describe("participant TOS URL filters", () => {
  it("renders the exact shareable status/sport contract and result count", () => {
    render(<TosFilters status="open" sport="all" resultCount={3} />);
    const status = screen.getByLabelText("Status");
    expect(status).toHaveAttribute("name", "status");
    expect(status).toHaveValue("open");
    expect(withinOptions(status)).toEqual(["all", "open", "closed"]);
    expect(screen.getByRole("group", { name: "Sport" })).toBeVisible();
    const sports = screen.getAllByRole("radio");
    expect(sports.map((control) => control.getAttribute("value"))).toEqual(["all", "padel", "tennis"]);
    expect(screen.getByRole("radio", { name: "Alles" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Padel" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Tennis" })).not.toBeChecked();
    expect(screen.getByText("3 TOS-avonden")).toBeVisible();
    expect(screen.getByRole("link", { name: "Filters wissen" })).toHaveAttribute("href", "/tos");
  });
});

function withinOptions(element: HTMLElement): string[] {
  return [...element.querySelectorAll("option")].map((option) => option.value);
}
