import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
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

vi.mock("../lib/auth/session", () => ({
  loadAccountContextWithClient,
}));
vi.mock("../lib/supabase/server", () => ({ createServerSupabaseClient }));
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
  });

  it("links the public homepage to live schedule and the shared login", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Jouw TOS-avond. Live.",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Doe mee met de volgende TOS",
    );
    expect(screen.getByRole("link", { name: "Bekijk live TOS-schema" })).toHaveAttribute(
      "href",
      "/live",
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
      "Geen aankomende TOS-avonden",
    );
    expect(screen.getByRole("link", { name: "Bekijk alle TOS-avonden" }))
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
    expect(screen.getByRole("heading", { level: 2, name: "Jouw volgende TOS" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Clubkampioenen TOS" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Padel TOS-avond" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aanmelding wijzigen" })).toHaveAttribute("href", "/tos/vrijdag-padel");
  });

  it("shows the staging badge from runtime APP_ENV", async () => {
    vi.stubEnv("APP_ENV", "staging");
    render(await Home());
    expect(screen.getByText("Staging")).toBeInTheDocument();
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
