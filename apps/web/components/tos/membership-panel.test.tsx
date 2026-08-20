import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deriveAccountContext, type MemberRecord, type ProfileRecord } from "../../lib/auth/account-context";
import { MembershipPanel } from "./membership-panel";

const identity = { userId: "user-1", email: "member@example.test" };

function account(
  profileOverrides: Partial<ProfileRecord> = {},
  member: MemberRecord | null = null,
) {
  return deriveAccountContext(identity, {
    id: identity.userId,
    display_name: "Dennis Seesing",
    role: "participant",
    active: true,
    member_id: null,
    ...profileOverrides,
  }, member);
}

describe("participant membership panel", () => {
  it("offers narrowly scoped onboarding for an active missing membership", () => {
    render(<MembershipPanel account={account()} returnPath="/tos/vrijdag-padel" />);
    expect(screen.getByRole("heading", { name: "Maak je clubprofiel aan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Naam")).toHaveValue("Dennis Seesing");
    const form = screen.getByRole("button", { name: "Clubprofiel aanmaken" }).closest("form");
    expect(form).toHaveAttribute("action", "/api/tos/onboard");
    expect(form?.querySelector('input[name="slug"]')).toHaveValue("vrijdag-padel");
    expect(form?.querySelectorAll("input")).toHaveLength(2);
  });

  it("never shows onboarding for an inactive profile even without member_id", () => {
    render(<MembershipPanel account={account({ active: false })} />);
    expect(screen.getByRole("heading", { name: "Clubprofiel inactief" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clubprofiel aanmaken" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it.each([
    ["pending", { id: "member-1", display_name: "Dennis", approval_status: "pending", active: true }],
    ["rejected", { id: "member-1", display_name: "Dennis", approval_status: "rejected", active: true }],
    ["inactive", { id: "member-1", display_name: "Dennis", approval_status: "approved", active: false }],
  ] as const)("shows %s status without a mutation form", (_state, linkedMember) => {
    render(<MembershipPanel account={account({ member_id: "member-1" }, linkedMember)} />);
    expect(screen.queryByRole("button", { name: "Clubprofiel aanmaken" })).not.toBeInTheDocument();
  });
});
