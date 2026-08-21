import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";
import { GET } from "./api/health/route";
import { deriveAccountContext } from "../lib/auth/account-context";

const loadOptionalAccountContext = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth/session", () => ({
  loadOptionalAccountContext,
}));

describe("WEB-2 routes", () => {
  beforeEach(() => {
    loadOptionalAccountContext.mockReset();
    loadOptionalAccountContext.mockResolvedValue(null);
  });

  it("links the public homepage to live schedule and the shared login", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Jouw TOS-avond in één oogopslag",
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

  it("replaces the anonymous login card with the authenticated TOS entry", async () => {
    loadOptionalAccountContext.mockResolvedValueOnce(deriveAccountContext(
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
      "Bekijk je TOS-avonden",
    );
    expect(screen.getByRole("link", { name: "Naar TOS-avonden" }))
      .toHaveAttribute("href", "/tos");
    expect(screen.queryByRole("link", { name: "Inloggen / aanmelden" }))
      .not.toBeInTheDocument();
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
    expect(source).toContain("loadLatestPublicSchedule");
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
  });
});
