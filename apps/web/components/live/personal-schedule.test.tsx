import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { PersonalSchedule, type PersonalScheduleRound } from "./personal-schedule";

const rounds: PersonalScheduleRound[] = [
  { id: "1", number: "1", time: "19:00–19:20", status: "rest", court: "", partner: "", opponents: "" },
  { id: "2", number: "2", time: "19:25–19:45", status: "playing", court: "PlaySeat met een bijzonder lange sponsornaam", partner: "Joyce van den Berg-van der Meer", opponents: "Yvo & Roland" },
  { id: "3", number: "3", time: "19:50–20:10", status: "playing", court: "Kremer", partner: "Yvo", opponents: "Niels & Bram" },
];

it("shows the first playing round for a non-live schedule, then selects a different round with keyboard", async () => {
  render(<PersonalSchedule rounds={rounds} active={false} playerName="Dennis" />);
  expect(screen.getByRole("heading", { name: rounds[1].court })).toBeVisible();
  expect(screen.queryByText("Nu spelen")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bekijk ronde 2" })).toHaveAttribute("aria-pressed", "true");
  const button = screen.getByRole("button", { name: "Bekijk ronde 3" });
  button.focus();
  await userEvent.keyboard("{Enter}");
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-pressed", "true");
  const detail = screen.getByRole("article", { name: "Geselecteerde ronde: Kremer" });
  expect(within(detail).getByText("Yvo")).toBeVisible();
  expect(within(detail).getByText("Niels", { exact: true })).toBeVisible();
  expect(within(detail).getByText("Bram", { exact: true })).toBeVisible();
  expect(within(detail).getByText("19:50–20:10")).toBeVisible();
});

it("keeps the authoritative current rest and next round, with no invented court", async () => {
  render(<PersonalSchedule rounds={rounds} active currentId="1" nextId="2" playerName="Dennis" />);
  const current = screen.getByRole("article", { name: "Nu: Rust" });
  expect(within(current).getByText("Nu rust")).toBeVisible();
  expect(within(current).queryByRole("heading", { name: "Rust" })).not.toBeInTheDocument();
  expect(within(current).queryByText("Rust", { exact: true })).not.toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Bekijk ronde 1" })).getAllByText("Rust", { exact: true })).toHaveLength(1);
  expect(within(screen.getByRole("button", { name: "Bekijk ronde 1" })).queryByText("Deze ronde speel je niet.")).not.toBeInTheDocument();
  expect(within(current).queryByText("BAAN")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Bekijk ronde 3" }));
  expect(screen.queryByText("Nu spelen")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Terug naar huidige ronde" }));
  expect(screen.getByText("Nu rust")).toBeVisible();
});

it("follows an authoritative current-round change until a round is deliberately selected", () => {
  const { rerender } = render(<PersonalSchedule rounds={rounds} active currentId="2" nextId="3" playerName="Dennis" />);
  expect(screen.getByText("Nu spelen")).toBeVisible();
  rerender(<PersonalSchedule rounds={rounds} active currentId="3" playerName="Dennis" />);
  expect(screen.getByRole("article", { name: "Nu: Kremer" })).toBeVisible();
});

it("can select rest in a past schedule while retaining all information in the detail", async () => {
  render(<PersonalSchedule rounds={rounds} active={false} playerName="Dennis" />);
  await userEvent.click(screen.getByRole("button", { name: "Bekijk ronde 1" }));
  expect(screen.getByRole("article", { name: "Geselecteerde ronde: Rust" })).toHaveTextContent("Deze ronde speel je niet.");
  expect(screen.queryByText("BAAN")).not.toBeInTheDocument();
  expect(screen.queryByText("Nu rust")).not.toBeInTheDocument();
});

it("handles a missing personal round without guessing a match", () => {
  render(<PersonalSchedule rounds={[]} active={false} playerName="Dennis" />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByText(/geen indeling/)).toBeVisible();
});
