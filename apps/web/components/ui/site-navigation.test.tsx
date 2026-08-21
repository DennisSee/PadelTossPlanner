import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deriveAccountContext } from "../../lib/auth/account-context";
import { AppHeader } from "./index";
import { navigationModelFromAccount, SiteNavigation } from "./site-navigation";

const identity = { userId: "user-1", email: "member@example.test" };

function account(role: "participant" | "planner" | "admin", withMember = true) {
  return deriveAccountContext(identity, {
    id: "user-1",
    display_name: "Member",
    role,
    active: true,
    member_id: withMember ? "member-1" : null,
  }, withMember ? {
    id: "member-1",
    display_name: "Member",
    approval_status: "approved",
    active: true,
  } : null);
}

describe("capability navigation", () => {
  it("links the shared brand to the internal homepage", () => {
    render(<AppHeader subtitle="TOS-avonden" />);
    expect(screen.getByRole("link", { name: "Naar startpagina" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", { name: "Logo T.C. Zuid" })).toBeVisible();
    expect(screen.getByText("T.C. Zuid TOS")).toBeVisible();
  });

  it("shows public routes and one login entry anonymously", () => {
    render(<SiteNavigation model={navigationModelFromAccount(null)} />);
    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Live TOS-schema" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Inloggen / aanmelden" })[0])
      .toHaveAttribute("href", "/login?next=%2Ftos");
  });

  it("keeps membership and staff links independent", () => {
    const participant = navigationModelFromAccount(account("participant"));
    const plannerWithoutMember = navigationModelFromAccount(account("planner", false));
    const participantView = render(<SiteNavigation model={participant} />);
    expect(screen.getAllByRole("link", { name: "TOS-avonden" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Beheer" })).not.toBeInTheDocument();
    participantView.unmount();

    render(<SiteNavigation model={plannerWithoutMember} />);
    expect(screen.getAllByRole("link", { name: "TOS-avonden" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Beheer" }).length).toBeGreaterThan(0);
  });
});
