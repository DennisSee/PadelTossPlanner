import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberManagement } from "./member-management";

const member = {
  memberId: "44444444-4444-4444-8444-444444444444",
  profileId: "33333333-3333-4333-8333-333333333333",
  accountRole: "participant" as const,
  displayName: "Dennis Seesing",
  loginEmail: "dennis@example.test",
  approvalStatus: "approved" as const,
  memberActive: true,
  accountLinked: true,
  padelProfileActive: true,
  padelRanking: 4,
  tennisProfileActive: false,
  tennisRanking: null,
};

describe("member and sport-profile management UI", () => {
  it("shows read-only membership context and independent sport forms", () => {
    const { container } = render(<MemberManagement members={[member]} query="Dennis" canAdminister={false} currentProfileId="99999999-9999-4999-8999-999999999999" />);
    expect(screen.getByRole("heading", { name: "Dennis Seesing" })).toBeVisible();
    expect(screen.getByText("dennis@example.test")).toBeVisible();
    expect(screen.getByText("Goedgekeurd")).toBeVisible();
    expect(screen.getByText("Lid actief")).toBeVisible();
    const forms = container.querySelectorAll<HTMLFormElement>('form[action="/api/beheer/leden/sport-profile"]');
    expect(forms).toHaveLength(2);
    const padel = forms[0];
    const tennis = forms[1];
    expect(within(padel).getByLabelText("Profiel")).toHaveValue("true");
    expect(within(padel).getByLabelText("Niveau")).toHaveValue("4");
    expect(within(tennis).getByLabelText("Profiel")).toHaveValue("false");
    expect(within(tennis).getByLabelText("Niveau")).toHaveValue("");
    expect(container.querySelector('[name="approval_status"]')).toBeNull();
    expect(container.querySelector('[name="member_active"]')).toBeNull();
    expect(container.querySelector('form[action="/api/beheer/leden/role"]')).toBeNull();
  });

  it("disambiguates equal display names with staff-only login email and has a controlled fallback", () => {
    render(<MemberManagement members={[
      member,
      { ...member, memberId: "55555555-5555-4555-8555-555555555555", profileId: "55555555-5555-4555-8555-555555555556", loginEmail: "dennis.two@example.test" },
      { ...member, memberId: "66666666-6666-4666-8666-666666666666", profileId: null, accountRole: null, displayName: "Los lid", loginEmail: null, accountLinked: false },
    ]} query="" canAdminister={false} currentProfileId="99999999-9999-4999-8999-999999999999" />);
    expect(screen.getAllByRole("heading", { name: "Dennis Seesing" })).toHaveLength(2);
    expect(screen.getByText("dennis@example.test")).toBeVisible();
    expect(screen.getByText("dennis.two@example.test")).toBeVisible();
    expect(screen.getAllByText("Geen gekoppeld account").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a compact empty search result", () => {
    render(<MemberManagement members={[]} query="Niemand" canAdminister={true} currentProfileId="99999999-9999-4999-8999-999999999999" />);
    expect(screen.getByText("0 leden")).toBeVisible();
    expect(screen.getByText("Geen leden gevonden.")).toBeVisible();
  });

  it("lets an admin change another linked account role but never their own", () => {
    const { container } = render(<MemberManagement members={[member]} query="" canAdminister currentProfileId="99999999-9999-4999-8999-999999999999" />);
    expect(screen.getByRole("button", { name: "Accountrol wijzigen" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Beheerder", hidden: true })).toBeInTheDocument();
    expect(container.querySelector('form[action="/api/beheer/leden/role"]')).not.toBeNull();
    const ownView = render(<MemberManagement members={[member]} query="" canAdminister currentProfileId={member.profileId} />);
    expect(within(ownView.container).getByText("Je kunt je eigen rol niet wijzigen.")).toBeVisible();
  });
});
