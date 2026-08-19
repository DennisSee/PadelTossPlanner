import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicSchedule } from "../../lib/public-schedule/types";
import { LivePageState } from "./live-page-state";
import { LiveSchedule } from "./live-schedule";

function schedule(participants = ["Zoë", "Anna"]): PublicSchedule {
  return {
    id: "schedule-1",
    eventDate: "2026-08-21",
    createdByName: "Planner",
    startTime: "20:00",
    endTime: "20:40",
    courts: ["Kremer Baan", "PlaySeat Baan"],
    participants,
    rows: [
      {
        Ronde: "1",
        Tijd: "20:00–20:20",
        Baan: "Kremer Baan",
        "Team 1": "Anna & Bram",
        "Team 2": "Cato & Daan",
        Rust: "Zoë",
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "",
      },
      {
        Ronde: "2",
        Tijd: "20:20–20:40",
        Baan: "PlaySeat Baan",
        "Team 1": "Zoë & Bram",
        "Team 2": "Anna & Daan",
        Rust: "",
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "",
      },
    ],
    isPublished: true,
    createdAt: "2026-08-20T18:00:00Z",
  };
}

describe("live schedule UI", () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows safe empty and load-error states", () => {
    const { rerender } = render(<LivePageState kind="empty" />);
    expect(screen.getByText("Er is nog geen gepubliceerd TOS-schema.")).toBeInTheDocument();
    rerender(<LivePageState kind="error" />);
    expect(screen.getByText(/kan momenteel niet worden geladen/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SUPABASE_");
  });

  it("shows event metadata, participants and current/next rounds", () => {
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T18:05:00.000Z" />);
    expect(screen.getByRole("heading", { name: "vrijdag 21 augustus 2026" })).toBeInTheDocument();
    expect(screen.getByText("20:00–20:40")).toBeInTheDocument();
    expect(screen.getByText("2 banen")).toBeInTheDocument();
    expect(screen.getByText("Deelnemers (2)")).toBeInTheDocument();
    expect(screen.getAllByText("Nu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hierna").length).toBeGreaterThan(0);
  });

  it("supports Iedereen and a selected personal schedule", async () => {
    const user = userEvent.setup();
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    const select = screen.getByLabelText("Kies je naam");
    expect(select).toHaveValue("Iedereen");
    expect(screen.getAllByText("Cato & Daan").length).toBeGreaterThan(0);

    await user.selectOptions(select, "Zoë");
    expect(select).toHaveValue("Zoë");
    expect(screen.getAllByText("Deze ronde heb je rust.").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("tc-zuid-tos/preferred-player")).toBe("Zoë");
  });

  it("uses a logical h1, h2 and round h3 heading structure", async () => {
    const user = userEvent.setup();
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("vrijdag 21 augustus 2026");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Wedstrijdschema");
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Kies je naam"), "Zoë");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Schema voor Zoë");
  });

  it("restores a valid preference and rejects an obsolete stored player", async () => {
    window.localStorage.setItem("tc-zuid-tos/preferred-player", "zoë");
    const { unmount } = render(
      <LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />,
    );
    await waitFor(() => expect(screen.getByLabelText("Kies je naam")).toHaveValue("Zoë"));
    unmount();

    window.localStorage.setItem("tc-zuid-tos/preferred-player", "Oude naam");
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    await waitFor(() => expect(screen.getByLabelText("Kies je naam")).toHaveValue("Iedereen"));
  });

  it.each(["", "Iedereen", "Oude willekeurige waarde"])(
    "falls back safely for a stored preference of %j",
    async (stored) => {
      if (stored) {
        window.localStorage.setItem("tc-zuid-tos/preferred-player", stored);
      }
      render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
      await waitFor(() => expect(screen.getByLabelText("Kies je naam")).toHaveValue("Iedereen"));
    },
  );

  it("responds to a preference storage event from another tab", async () => {
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    window.localStorage.setItem("tc-zuid-tos/preferred-player", "Zoë");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "tc-zuid-tos/preferred-player",
      newValue: "Zoë",
    })));
    await waitFor(() => expect(screen.getByLabelText("Kies je naam")).toHaveValue("Zoë"));
  });

  it("keeps rendering with Iedereen when localStorage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    expect(screen.getByLabelText("Kies je naam")).toHaveValue("Iedereen");
    expect(screen.getByRole("heading", { name: "vrijdag 21 augustus 2026" })).toBeInTheDocument();
  });

  it("keeps the select usable when localStorage writes throw", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    const select = screen.getByLabelText("Kies je naam");
    await user.selectOptions(select, "Zoë");
    expect(select).toHaveValue("Zoë");
    expect(screen.getAllByText("Deze ronde heb je rust.").length).toBeGreaterThan(0);
  });

  it("uses the in-memory fallback when reads and writes are blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    const select = screen.getByLabelText("Kies je naam");
    expect(select).toHaveValue("Iedereen");
    await user.selectOptions(select, "Zoë");
    expect(select).toHaveValue("Zoë");
  });

  it("falls back in memory when storage becomes unavailable after mount", async () => {
    const user = userEvent.setup();
    render(<LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:55:00.000Z" />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked later", "SecurityError");
    });
    const select = screen.getByLabelText("Kies je naam");
    await user.selectOptions(select, "Zoë");
    expect(select).toHaveValue("Zoë");
  });

  it("runs one 30-second clock, updates live state, cleans up and never fetches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T17:59:45.000Z"));
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearSpy = vi.spyOn(window, "clearInterval");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const view = render(
      <LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:59:45.000Z" />,
    );
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(screen.getByText("Start over 1 min")).toBeInTheDocument();

    view.rerender(
      <LiveSchedule schedule={schedule()} initialNowIso="2026-08-21T17:59:45.000Z" />,
    );
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getAllByText("Nu").length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    view.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("renders database-like HTML names as escaped React text", () => {
    const unsafeName = '<img src=x onerror="alert(1)">';
    render(
      <LiveSchedule
        schedule={schedule([unsafeName])}
        initialNowIso="2026-08-21T17:55:00.000Z"
      />,
    );
    expect(screen.getAllByText(unsafeName).length).toBeGreaterThan(0);
    expect(document.querySelector("img[src='x']")).not.toBeInTheDocument();
  });
});
