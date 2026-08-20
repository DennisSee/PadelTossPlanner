import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegistrationForm } from "./registration-form";

describe("self-service registration form", () => {
  it("defaults to the full event window with one-minute controls", () => {
    render(
      <RegistrationForm
        slug="vrijdag-padel"
        initialResponse="attending"
        initialFrom="20:00"
        initialUntil="22:00"
        existing={false}
      />,
    );
    expect(screen.getByLabelText("Ik doe mee")).toBeChecked();
    expect(screen.getByLabelText("Vanaf")).toHaveValue("20:00");
    expect(screen.getByLabelText("Vanaf")).toHaveAttribute("step", "60");
    expect(screen.getByLabelText("Tot")).toHaveAttribute("step", "60");
    expect(screen.getByRole("button", { name: "Aanmelden" })).toBeInTheDocument();
  });

  it("switches to declined without adding identity authority fields", () => {
    const { container } = render(
      <RegistrationForm
        slug="vrijdag-padel"
        initialResponse="attending"
        initialFrom="20:00"
        initialUntil="22:00"
        existing
      />,
    );
    fireEvent.click(screen.getByLabelText("Ik doe niet mee"));
    expect(screen.getByLabelText("Ik doe niet mee")).toBeChecked();
    expect(screen.getByLabelText("Vanaf")).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Aanmelding wijzigen" })).toBeInTheDocument();
    expect(container.querySelectorAll('input[name="slug"]')).toHaveLength(1);
    for (const name of ["event_id", "registration_id", "user_id", "member_id", "source", "role"]) {
      expect(container.querySelector(`[name="${name}"]`)).toBeNull();
    }
  });
});
