import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ActionDialog } from "./action-dialog";

describe("action dialog", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) { this.open = true; }),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => { callback(0); return 1; },
    });
  });

  it("opens a labelled native dialog and focuses the intended field", () => {
    render(
      <ActionDialog triggerLabel="Wijzigen" title="Gegevens wijzigen" description="Veilige uitleg">
        <input aria-label="Naam" data-dialog-initial />
      </ActionDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleName("Gegevens wijzigen");
    expect(dialog).toHaveAccessibleDescription("Veilige uitleg");
    expect(screen.getByLabelText("Naam")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Sluiten" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Annuleren" }).closest("form")).toHaveAttribute("method", "dialog");
  });
});
