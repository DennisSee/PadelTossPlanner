import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResponsiveCreatePanel } from "./responsive-create-panel";

describe("responsive create panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts compact on mobile and opens on wide layouts", () => {
    const listeners: Array<() => void> = [];
    const media = {
      matches: false,
      addEventListener: (_event: string, callback: () => void) => listeners.push(callback),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    render(<ResponsiveCreatePanel><p>Formulier</p></ResponsiveCreatePanel>);
    const disclosure = screen.getByText("Nieuwe TOS").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    act(() => { media.matches = true; listeners[0]?.(); });
    expect(disclosure).toHaveAttribute("open");
  });
});
