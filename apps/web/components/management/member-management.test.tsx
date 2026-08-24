import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffMemberDirectoryItem } from "../../lib/tos/types";
import { MemberManagement } from "./member-management";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const member: StaffMemberDirectoryItem = Object.freeze({
  memberId: "44444444-4444-4444-8444-444444444444",
  profileId: "33333333-3333-4333-8333-333333333333",
  accountRole: "participant",
  displayName: "Dennis Seesing",
  loginEmail: "dennis@example.test",
  approvalStatus: "approved",
  memberActive: true,
  accountLinked: true,
  padelProfileActive: true,
  padelRanking: 4,
  tennisProfileActive: false,
  tennisRanking: null,
});
const second: StaffMemberDirectoryItem = Object.freeze({ ...member, memberId: "55555555-5555-4555-8555-555555555555", profileId: "55555555-5555-4555-8555-555555555556", displayName: "Joyce Walta", loginEmail: "joyce@example.test" });

beforeEach(() => {
  refresh.mockClear();
  vi.restoreAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); } });
});

describe("compact member management", () => {
  it("renders a semantic compact table and a dedicated mobile list with staff-only email context", () => {
    render(<MemberManagement members={[member, second]} query="" canAdminister={false} currentProfileId="other" />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("columnheader", { name: "Lid" })).toBeVisible();
    expect(screen.getAllByText("dennis@example.test").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Padelprofiel voor Dennis Seesing")).toHaveValue("true");
    expect(screen.getByLabelText("Padelniveau voor Dennis Seesing")).toHaveValue("4");
    expect(screen.getAllByRole("button", { name: /Details van/u })).toHaveLength(2);
  });

  it("stages multiple fields for one member and reverts back to a clean state", async () => {
    const user = userEvent.setup();
    render(<MemberManagement members={[member]} query="" canAdminister currentProfileId="other" />);
    const padelLevel = screen.getByLabelText("Padelniveau voor Dennis Seesing");
    await user.selectOptions(padelLevel, "2");
    await user.selectOptions(screen.getByLabelText("Accountrol voor Dennis Seesing"), "planner");
    expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("1 lid gewijzigd");
    await user.selectOptions(padelLevel, "4");
    expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("1 lid gewijzigd");
    await user.selectOptions(screen.getByLabelText("Accountrol voor Dennis Seesing"), "participant");
    expect(screen.queryByRole("region", { name: "Niet-opgeslagen wijzigingen" })).not.toBeInTheDocument();
  });

  it("counts dirty members, not changed fields, and discards them globally", async () => {
    const user = userEvent.setup();
    render(<MemberManagement members={[member, second]} query="" canAdminister={false} currentProfileId="other" />);
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Dennis Seesing"), "2");
    await user.selectOptions(screen.getByLabelText("Tennisprofiel voor Dennis Seesing"), "true");
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Joyce Walta"), "3");
    expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("2 leden gewijzigd");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(screen.queryByRole("region", { name: "Niet-opgeslagen wijzigingen" })).not.toBeInTheDocument();
  });

  it("opens the mobile editor, closes without applying, then stages both sports on apply", async () => {
    const user = userEvent.setup();
    render(<MemberManagement members={[member]} query="" canAdminister={false} currentProfileId="other" />);
    const mobileRow = screen.getAllByRole("button", { name: /Dennis Seesing/u }).find((button) => button.className.includes("mobileMember"))!;
    await user.click(mobileRow);
    const dialog = screen.getAllByRole("dialog", { hidden: true })[0] as HTMLDialogElement;
    await user.selectOptions(within(dialog).getAllByLabelText("Niveau", { selector: "select" })[0], "2");
    dialog.close();
    expect(screen.queryByRole("region", { name: "Niet-opgeslagen wijzigingen" })).not.toBeInTheDocument();

    await user.click(mobileRow);
    const levels = within(dialog).getAllByLabelText("Niveau", { selector: "select" });
    await user.selectOptions(levels[0], "2");
    await user.selectOptions(within(dialog).getAllByLabelText("Profiel", { selector: "select" })[1], "true");
    await user.selectOptions(levels[1], "3");
    await user.click(within(dialog).getByRole("button", { name: "Wijzigingen toepassen" }));
    expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("1 lid gewijzigd");
    expect(screen.getByText("Padel 2")).toBeVisible();
    expect(screen.getByText("Tennis 3")).toBeVisible();
  });

  it("cleans successful writes and leaves only the failed member dirty", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, url: "https://example.test/beheer/leden?notice=sport-profile-updated", headers: new Headers() } as Response)
      .mockResolvedValueOnce({ ok: true, url: "https://example.test/beheer/leden?error=temporarily-unavailable", headers: new Headers() } as Response);
    render(<MemberManagement members={[member, second]} query="" canAdminister={false} currentProfileId="other" />);
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Dennis Seesing"), "2");
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Joyce Walta"), "3");
    await user.click(screen.getByRole("button", { name: "2 wijzigingen opslaan" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("1 lid gewijzigd"));
    expect(screen.getByRole("alert")).toHaveTextContent("1 lid kon niet volledig worden opgeslagen");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does no request without changes and keeps role controls read-only for planners and own admins", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { rerender } = render(<MemberManagement members={[member]} query="" canAdminister={false} currentProfileId="other" />);
    expect(screen.queryByLabelText("Accountrol voor Dennis Seesing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /opslaan/u })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<MemberManagement members={[member]} query="" canAdminister currentProfileId={member.profileId!} />);
    expect(screen.queryByLabelText("Accountrol voor Dennis Seesing")).not.toBeInTheDocument();
  });

  it("filters by name and email, combines filters and clears them", async () => {
    const user = userEvent.setup();
    render(<MemberManagement members={[member, { ...second, accountLinked: false, profileId: null, accountRole: null, tennisProfileActive: true, tennisRanking: null }]} query="" canAdminister={false} currentProfileId="other" />);
    const search = screen.getByPlaceholderText("Zoek leden");
    await user.type(search, "joyce@example");
    expect(screen.getByText("1 lid")).toBeVisible();
    await user.clear(search);
    await user.selectOptions(screen.getByLabelText("Accountfilter"), "unlinked");
    await user.selectOptions(screen.getByLabelText("Niveaufilter"), "missing");
    expect(screen.getByText("1 lid")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Filters wissen" }));
    expect(screen.getByText("2 leden")).toBeVisible();
  });

  it("removes only the deleted member's staged state after the existing UUID-based delete succeeds", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, url: "https://example.test/beheer/leden?notice=member-deleted", headers: new Headers() } as Response);
    render(<MemberManagement members={[member, second]} query="" canAdminister currentProfileId="other" />);
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Dennis Seesing"), "2");
    await user.selectOptions(screen.getByLabelText("Padelniveau voor Joyce Walta"), "3");
    fireEvent.click(screen.getByRole("button", { name: "Details van Dennis Seesing" }));
    const editor = screen.getAllByRole("dialog", { hidden: true })[0];
    await user.click(within(editor).getByRole("button", { name: "Lid verwijderen", hidden: true }));
    const confirmation = screen.getAllByRole("dialog", { hidden: true })[2];
    await user.click(within(confirmation).getByRole("button", { name: "Lid verwijderen", hidden: true }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveTextContent("1 lid gewijzigd"));
    expect(refresh).toHaveBeenCalled();
  });
});
