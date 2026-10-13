import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";
import { metadata } from "./layout";
import { GET } from "./api/health/route";
import { deriveAccountContext } from "../lib/auth/account-context";

const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const listParticipantEvents = vi.hoisted(() => vi.fn());
const listOwnUpcomingRegistrations = vi.hoisted(() => vi.fn());
const ownRegistrationPosition = vi.hoisted(() => vi.fn());
const eventCapacity = vi.hoisted(() => vi.fn());
const eventAttendance = vi.hoisted(() => vi.fn());
const loadEventPublicSchedule = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth/session", () => ({
  loadAccountContextWithClient,
}));
vi.mock("../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../lib/supabase/public-schedule-repository", () => ({ loadEventPublicSchedule }));
vi.mock("../lib/tos/repository", () => ({ TosRepository: class {
  listParticipantEvents = listParticipantEvents;
  listOwnUpcomingRegistrations = listOwnUpcomingRegistrations;
  ownRegistrationPosition = ownRegistrationPosition;
  eventCapacity = eventCapacity;
  eventAttendance = eventAttendance;
} }));

describe("WEB-2 routes", () => {
  beforeEach(() => {
    loadAccountContextWithClient.mockReset();
    loadAccountContextWithClient.mockResolvedValue(null);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    listParticipantEvents.mockResolvedValue([]);
    listOwnUpcomingRegistrations.mockResolvedValue([]);
    ownRegistrationPosition.mockReset();
    eventCapacity.mockReset();
    eventAttendance.mockReset();
    loadEventPublicSchedule.mockReset();
    loadEventPublicSchedule.mockResolvedValue(null);
  });

  it("links the public homepage to live schedule and the shared login", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Zin in een TOS?",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Doe mee met de volgende TOS",
    );
    expect(screen.getByRole("link", { name: "BEKIJK TOS-MOMENTEN" })).toHaveAttribute(
      "href",
      "/tos",
    );
    expect(screen.getAllByRole("link", { name: "Inloggen / aanmelden" })[0])
      .toHaveAttribute("href", "/login?next=%2Ftos");
    expect(screen.getByText(/Google of een e-mailcode/i)).toBeVisible();
  });

  it("publishes the existing club logo as the browser icon", () => {
    expect(metadata.icons).toEqual({
      icon: [{ url: "/tc-zuid-favicon.png", sizes: "329x329", type: "image/png" }],
      apple: [{ url: "/tc-zuid-favicon.png", sizes: "329x329", type: "image/png" }],
    });
  });

  it("shows a compact participant empty state when no event is relevant", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce(deriveAccountContext(
      { userId: "user-1", email: "member@example.test" },
      {
        id: "user-1",
        display_name: "Member",
        role: "participant",
        active: true,
        member_id: "member-1",
      },
      {
        id: "member-1",
        display_name: "Member",
        approval_status: "approved",
        active: true,
      },
    ));
    render(await Home());
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Geen aankomende TOS-momenten",
    );
    expect(screen.getByRole("link", { name: "Bekijk alle TOS-momenten" }))
      .toHaveAttribute("href", "/tos");
    expect(screen.queryByRole("link", { name: "Inloggen / aanmelden" }))
      .not.toBeInTheDocument();
  });

  it("renders one personalized event with its custom title and placement action", async () => {
    const event = {
      id: "10000000-0000-4000-8000-000000000001",
      slug: "vrijdag-padel",
      title: "Clubkampioenen TOS",
      sport: "padel" as const,
      startsAt: "2099-08-28T18:00:00.000Z",
      endsAt: "2099-08-28T20:00:00.000Z",
      signupDeadline: "2099-08-27T17:00:00.000Z",
      status: "open" as const,
      maxParticipants: 4,
    };
    const registration = {
      id: "20000000-0000-4000-8000-000000000001",
      eventId: event.id,
      response: "attending" as const,
      availableFrom: event.startsAt,
      availableUntil: event.endsAt,
      attendingSince: "2099-08-01T10:00:00.000Z",
      createdAt: "2099-08-01T10:00:00.000Z",
      updatedAt: "2099-08-01T10:00:00.000Z",
      event,
    };
    loadAccountContextWithClient.mockResolvedValueOnce(deriveAccountContext(
      { userId: "user-1", email: "member@example.test" },
      { id: "user-1", display_name: "Member", role: "participant", active: true, member_id: "member-1" },
      { id: "member-1", display_name: "Member", approval_status: "approved", active: true },
    ));
    listParticipantEvents.mockResolvedValueOnce([event]);
    listOwnUpcomingRegistrations.mockResolvedValueOnce([registration]);
    ownRegistrationPosition.mockResolvedValueOnce({ placementStatus: "placed", waitlistPosition: null });
    eventCapacity.mockResolvedValueOnce({ maxParticipants: 4, placedCount: 1, availableCount: 3, waitlistCount: 0 });
    eventAttendance.mockResolvedValueOnce([{ displayName: "Member", placementStatus: "placed", waitlistPosition: null }]);

    render(await Home());
    expect(screen.getByRole("heading", { level: 2, name: "Jouw inschrijving" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Je volgende TOS staat klaar" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: /live/u })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Mijn aanmelding" })[0]).toHaveAttribute("href", "/tos/vrijdag-padel");
    expect(screen.getByRole("heading", { level: 3, name: "Clubkampioenen TOS" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Padel TOS-avond" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Mijn aanmelding" })[1]).toHaveAttribute("href", "/tos/vrijdag-padel");
  });

  it.each([
    [false, "Mijn aanmelding", "/tos/vrijdag-padel"],
    [true, "Bekijk je schema", "/live/vrijdag-padel"],
  ] as const)("maps a closed placed registration truthfully when schedule published=%s", async (published, label, href) => {
    const event = {
      id: "10000000-0000-4000-8000-000000000002", slug: "vrijdag-padel", title: "Besloten TOS",
      sport: "padel" as const, startsAt: "2099-08-28T18:00:00.000Z", endsAt: "2099-08-28T20:00:00.000Z",
      signupDeadline: "2026-08-01T17:00:00.000Z", status: "closed" as const, maxParticipants: 4,
    };
    const registration = {
      id: "20000000-0000-4000-8000-000000000002", eventId: event.id, response: "attending" as const,
      availableFrom: event.startsAt, availableUntil: event.endsAt, attendingSince: "2026-08-01T10:00:00.000Z",
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z", event,
    };
    loadAccountContextWithClient.mockResolvedValueOnce(deriveAccountContext(
      { userId: "user-1", email: "member@example.test" },
      { id: "user-1", display_name: "Member", role: "participant", active: true, member_id: "member-1" },
      { id: "member-1", display_name: "Member", approval_status: "approved", active: true },
    ));
    const openEvent = { ...event, id: "open-other", slug: "open-other", title: "Open middag TOS", status: "open" as const, signupDeadline: null };
    listParticipantEvents.mockResolvedValueOnce([event, openEvent]);
    listOwnUpcomingRegistrations.mockResolvedValueOnce([registration]);
    ownRegistrationPosition.mockResolvedValueOnce({ placementStatus: "placed", waitlistPosition: null });
    eventCapacity.mockResolvedValue({ maxParticipants: 4, placedCount: 1, availableCount: 3, waitlistCount: 0 });
    eventAttendance.mockResolvedValue([{ displayName: "Member", placementStatus: "placed", waitlistPosition: null }]);
    loadEventPublicSchedule.mockResolvedValueOnce(published ? { id: "published" } : null);

    render(await Home());
    const personal = screen.getByRole("region", { name: "Jouw inschrijving" });
    const open = screen.getByRole("region", { name: "Andere open TOS-momenten" });
    expect(within(personal).getByRole("heading", { level: 3, name: event.title })).toBeVisible();
    expect(within(open).queryByRole("heading", { name: event.title })).not.toBeInTheDocument();
    expect(within(open).getByRole("heading", { level: 3, name: openEvent.title })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3, name: event.title })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: label })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: label })[0]).toHaveAttribute("href", href);
    expect(screen.queryByRole("link", { name: "Opnieuw aanmelden" })).not.toBeInTheDocument();
  });

  it.each([false, true])("groups personal and open cards chronologically with multiple placements=%s", async (multiple) => {
    loadAccountContextWithClient.mockResolvedValueOnce(deriveAccountContext(
      { userId: "user-1", email: "member@example.test" },
      { id: "user-1", display_name: "Member", role: "participant", active: true, member_id: "member-1" },
      { id: "member-1", display_name: "Member", approval_status: "approved", active: true },
    ));
    const events = [8, 12, 16, 20].map((hour, index) => ({
      id: `event-${index}`, slug: `tos-${index}`, title: `Club TOS-avond ${index}`,
      sport: "padel" as const, status: "open" as "open" | "closed", maxParticipants: 4, signupDeadline: null,
      startsAt: `2099-08-28T${String(hour).padStart(2, "0")}:00:00Z`,
      endsAt: `2099-08-28T${String(hour + 2).padStart(2, "0")}:00:00Z`,
    }));
    if (multiple) events[3] = { ...events[3], status: "closed" };
    const registrations = [events[0], events[1], events[3]].map((event, index) => ({
      id: `registration-${index}`, eventId: event.id, event,
      response: index === 1 ? "declined" as const : "attending" as const,
      availableFrom: index === 1 ? null : event.startsAt,
      availableUntil: index === 1 ? null : event.endsAt,
      attendingSince: null, createdAt: "2099-08-01T10:00:00Z", updatedAt: "2099-08-01T10:00:00Z",
    }));
    listParticipantEvents.mockResolvedValueOnce([...events].reverse());
    listOwnUpcomingRegistrations.mockResolvedValueOnce(registrations);
    ownRegistrationPosition.mockImplementation(async (id) => ({
      placementStatus: id === "event-0" && !multiple ? "waitlist" : "placed",
      waitlistPosition: id === "event-0" && !multiple ? 2 : null,
    }));
    eventCapacity.mockResolvedValue({ maxParticipants: 4, placedCount: 4, availableCount: 0, waitlistCount: 2 });
    eventAttendance.mockResolvedValue([]);
    render(await Home());
    const personal = screen.getByRole("region", { name: multiple ? "Jouw inschrijvingen" : "Jouw inschrijving" });
    const open = screen.getByRole("region", { name: "Andere open TOS-momenten" });
    expect(within(personal).getAllByRole("heading", { level: 3 }).map((node) => node.textContent))
      .toEqual((multiple ? [events[0], events[3]] : [events[3]]).map((event) => event.title));
    expect(within(open).getAllByRole("heading", { level: 3 }).map((node) => node.textContent))
      .toEqual((multiple ? [events[1], events[2]] : events.slice(0, 3)).map((event) => event.title));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(multiple ? "Jouw TOS-momenten staan klaar" : "Je volgende TOS staat klaar");
    if (multiple) expect(document.querySelector('[class*="heroCue"]')).toBeNull();
    if (!multiple) expect(screen.getByText("Wachtlijst · plek 2")).toBeVisible();
    else expect(screen.getByRole("link", { name: "Bekijk je inschrijvingen" })).toHaveAttribute("href", "#home-enrollments");
    expect(screen.getByText("Afgemeld")).toBeVisible();
    expect(screen.getAllByText("✓ Je bent geplaatst")).toHaveLength(multiple ? 2 : 1);
    expect(screen.getByRole("link", { name: "Aanmelden" })).toHaveAttribute("href", "/tos/tos-2");
    expect(screen.getAllByRole("link", { name: "Opnieuw aanmelden" })).toHaveLength(1);
    if (!multiple) expect(screen.getByRole("link", { name: "Mijn wachtlijstpositie" })).toHaveAttribute("href", "/tos/tos-0");
    expect(eventCapacity).toHaveBeenCalledTimes(4);
    expect(eventAttendance).toHaveBeenCalledTimes(4);
  });

  it("does not load participant data for staff without membership", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce(deriveAccountContext(
      { userId: "staff-1", email: "staff@example.test" },
      { id: "staff-1", display_name: "Staff", role: "planner", active: true, member_id: null },
      null,
    ));
    render(await Home());
    expect(listParticipantEvents).not.toHaveBeenCalled();
    expect(loadEventPublicSchedule).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Naar TOS-momenten" })).toHaveAttribute("href", "/tos");
  });

  it("does not expose the staging badge while runtime APP_ENV stays staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    render(await Home());
    expect(screen.queryByText("Staging")).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("keeps the web health route independent", async () => {
    const response = GET();
    await expect(response.json()).resolves.toEqual({ status: "ok", service: "web" });
  });

  it("keeps live server-rendered through the server-only repository", () => {
    const source = readFileSync(resolve(process.cwd(), "app/live/page.tsx"), "utf8");
    expect(source).toContain('dynamic = "force-dynamic"');
    expect(source).toContain("loadPublicLiveCandidates");
    expect(source).toContain("resolveLiveCandidates");
    expect(source).not.toContain("NEXT_PUBLIC_");
  });

  it("keeps the homepage runtime-rendered for its environment badge", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
    expect(source).toContain('dynamic = "force-dynamic"');
  });

  it("keeps FastAPI internal-only behind the Next.js server boundary", () => {
    const caddy = readFileSync(resolve(process.cwd(), "../../deploy/staging/Caddyfile"), "utf8");
    const compose = readFileSync(resolve(process.cwd(), "../../deploy/staging/compose.yml"), "utf8");
    expect(caddy).not.toContain("/api/planner/");
    expect(caddy).not.toContain("planner-api:8000");
    expect(compose).toContain("PLANNER_API_BASE_URL: http://planner-api:8000");
    expect(compose).toContain("dockerfile: services/planner-api/Dockerfile");
    expect(compose).toContain("web-egress");
    expect(compose).toContain("internal: true");
  });

  it("disables the inherited HTTP healthcheck only for the background notification worker", () => {
    const compose = readFileSync(resolve(process.cwd(), "../../deploy/staging/compose.yml"), "utf8");
    const worker = compose.split("  notification-worker:")[1]?.split("\n  planner-api:")[0] ?? "";
    expect(worker).toContain('command: ["node", "notification-worker.mjs"]');
    expect(worker).toContain("healthcheck:\n      disable: true");
    expect(worker).not.toContain("wget");
    expect(worker).not.toContain("ports:");
  });

  it("uses the canonical staging domain throughout deployment contracts", () => {
    for (const file of ["Caddyfile", ".env.example", "compose.yml", "preflight.sh", "smoke-test.sh", "test-smoke-redirects.sh"]) {
      const source = readFileSync(resolve(process.cwd(), `../../deploy/staging/${file}`), "utf8");
      expect(source).toContain("tczuidtos.oddbounce.nl");
      expect(source).not.toContain("test-tos.oddbounce.nl");
    }
  });

  it("keeps UI hierarchy and keyboard focus structural rather than pixel-bound", () => {
    const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const uiCss = readFileSync(resolve(process.cwd(), "components/ui/ui.module.css"), "utf8");
    const liveCss = readFileSync(
      resolve(process.cwd(), "components/live/live-schedule.module.css"),
      "utf8",
    );
    expect(liveCss).toContain(".select:focus-visible");
    expect(liveCss).toContain(".roundNeutral");
    expect(liveCss).toContain(".currentPanel");
    expect(liveCss).toContain(".nextPanel");
    expect(liveCss).toContain(".courtKremer { --court-accent:");
    expect(liveCss).toContain(".courtZga { --court-accent:");
    expect(liveCss).toContain(".selectedPlayer");
    expect(globalCss).toContain("--font-display:");
    expect(globalCss).toContain("--font-interface:");
    expect(globalCss).not.toContain("--font-body:");
    expect(globalCss).toContain("--club-green: #004b36;");
    expect(globalCss).toContain("--page-background: #faf7ef;");
    expect(globalCss).toContain("--club-yellow:");
    expect(uiCss).toContain(".linkButton");
    expect(uiCss).toContain("font-family: var(--font-interface)");
    expect(uiCss).toContain(".courtLines");
    expect(uiCss).toContain(".dateRail");
    expect(uiCss).toContain(".sportBadgePadel");
    expect(uiCss).toContain(".sportBadgeTennis");
    expect(liveCss).toContain("overflow-wrap: normal");
  });
});
