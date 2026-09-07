import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { PersonalLive } from "./personal-live";
import type { LiveIdentity } from "../../lib/public-schedule/identity";

const keys = [1, 2, 3, 4, 5].map((n) => `a4600000-0000-4000-8000-00000000000${n}`);
const identity: LiveIdentity = {
  players: keys.map((key, i) => ({ key, name: i < 2 ? "Dezelfde Naam" : `Speler ${i}` })),
  rounds: [1, 2].map((number) => ({ number, starts_at: `2026-09-07T18:${number === 1 ? "00" : "20"}:00Z`, ends_at: `2026-09-07T18:${number === 1 ? "20" : "40"}:00Z`,
    slots: keys.map((key, i) => ({ key, state: i === 4 ? "rest" : "playing", court: i === 4 ? null : "Kremer Baan", team: i === 4 ? null : i < 2 ? 1 : 2 })),
  })),
};
it("selects the exact opaque own key despite duplicate names and permits Everyone", async () => {
  render(<PersonalLive identity={identity} ownKey={keys[1]} now={new Date("2026-09-07T18:05:00Z")} slug="live-event" />);
  expect(screen.getByLabelText("Schema voor")).toHaveValue(keys[1]);
  const current = screen.getByRole("article", { name: "Nu: Kremer Baan" });
  expect(within(current).getByText("Dezelfde Naam")).toBeInTheDocument();
  expect(current).toHaveTextContent("Speler 2 & Speler 3");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  await userEvent.selectOptions(screen.getByLabelText("Schema voor"), "");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
it("shows rest and one next round", () => {
  render(<PersonalLive identity={identity} ownKey={keys[4]} now={new Date("2026-09-07T18:05:00Z")} slug="live-event" />);
  expect(screen.getByRole("article", { name: "Nu: Rust" })).toHaveTextContent("Deze ronde speel je niet.");
  expect(screen.getByRole("article", { name: "Hierna: Rust" })).toBeInTheDocument();
});
it("does not match a name or stale key", () => {
  const { container } = render(<PersonalLive identity={identity} ownKey="Dezelfde Naam" now={new Date()} slug="live-event" />);
  expect(container).toBeEmptyDOMElement();
});
