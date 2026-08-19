import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";
import { GET } from "./api/health/route";

describe("WEB-2 routes", () => {
  it("links the public homepage to the live schedule", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Bekijk live TOS-schema" })).toHaveAttribute(
      "href",
      "/live",
    );
  });

  it("shows the staging badge from runtime APP_ENV", () => {
    vi.stubEnv("APP_ENV", "staging");
    render(<Home />);
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

  it("keeps FastAPI health routing and network boundaries intact", () => {
    const caddy = readFileSync(resolve(process.cwd(), "../../deploy/staging/Caddyfile"), "utf8");
    const compose = readFileSync(resolve(process.cwd(), "../../deploy/staging/compose.yml"), "utf8");
    expect(caddy).toContain("handle_path /api/planner/*");
    expect(caddy).toContain("reverse_proxy planner-api:8000");
    expect(compose).toContain("web-egress");
    expect(compose).toContain("internal: true");
  });
});
