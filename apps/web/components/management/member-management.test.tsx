import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberManagement } from "./member-management";

const member = {
  memberId: "44444444-4444-4444-8444-444444444444",
  displayName: "Dennis Seesing",
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
    const { container } = render(<MemberManagement members={[member]} query="Dennis" />);
    expect(screen.getByRole("heading", { name: "Dennis Seesing" })).toBeVisible();
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
    expect(container.querySelector('[name="role"]')).toBeNull();
  });

  it("renders a compact empty search result", () => {
    render(<MemberManagement members={[]} query="Niemand" />);
    expect(screen.getByText("0 leden")).toBeVisible();
    expect(screen.getByText("Geen leden gevonden.")).toBeVisible();
  });
});
