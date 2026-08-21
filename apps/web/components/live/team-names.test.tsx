import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamNames } from "./team-names";

describe("TeamNames", () => {
  it.each([
    ["Dennis & Jeroen", "dennis", "Dennis"],
    ["Peter & Dennis", "DENNIS", "Dennis"],
  ])("marks one exact selected player in either team position", (team, selected, expected) => {
    render(<TeamNames team={team} selectedPlayer={selected} />);
    expect(screen.getByText(expected, { exact: true }).parentElement).toHaveAttribute(
      "data-selected-player",
      "true",
    );
    expect(screen.queryByText("jij", { exact: false })).not.toBeInTheDocument();
  });

  it("does not use substring matching and leaves everyone neutral", () => {
    const { rerender } = render(<TeamNames team="Ann & Anna" selectedPlayer="Ann" />);
    expect(screen.getByText("Ann", { exact: true }).parentElement).toHaveAttribute(
      "data-selected-player",
      "true",
    );
    expect(screen.getByText("Anna", { exact: true }).parentElement).not.toHaveAttribute(
      "data-selected-player",
    );

    rerender(<TeamNames team="Ann & Anna" />);
    expect(document.querySelectorAll('[data-selected-player="true"]')).toHaveLength(0);
  });

  it("keeps database-like HTML as escaped React text", () => {
    const unsafeName = '<img src=x onerror="alert(1)">';
    render(<TeamNames team={`${unsafeName} & Anna`} selectedPlayer={unsafeName} />);
    expect(screen.getByText(unsafeName, { exact: true })).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).not.toBeInTheDocument();
  });
});
