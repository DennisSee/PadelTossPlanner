import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deriveAccountContext } from "../../lib/auth/account-context";
import { AccountShell, LogoutForm, membershipLabel } from "./account-shell";

const identity = { userId: "user-1", email: "admin@example.test" };

describe("protected account shell", () => {
  it("shows combined membership and staff capabilities without leaking identity ids", () => {
    const account = deriveAccountContext(identity, {
      id: "user-1", display_name: "Admin", role: "admin", active: true, member_id: "member-1",
    }, {
      id: "member-1", display_name: "Admin", approval_status: "approved", active: true,
    });
    render(<AccountShell account={account} title="Mijn account" intro="Status"><p>Inhoud</p></AccountShell>);
    expect(screen.getByText("Clublid goedgekeurd")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("user-1");
    expect(document.body.textContent).not.toContain("member-1");
  });

  it("posts one shared logout instead of exposing a GET link", () => {
    render(<LogoutForm />);
    const form = screen.getByRole("button", { name: "Uitloggen" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/logout");
  });

  it.each(["missing", "pending", "approved", "rejected", "inactive", "inconsistent"] as const)(
    "has controlled copy for %s membership",
    (state) => expect(membershipLabel(state)).not.toMatch(/undefined|error/i),
  );
});
