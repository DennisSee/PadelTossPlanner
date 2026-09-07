import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveSelection } from "./live-selection";

describe("live event selection", () => {
  it("toont uitsluitend veilige eventmetadata en canonieke links", () => {
    const { container } = render(<LiveSelection nowIso="2026-09-07T12:00:00Z" candidates={[
      { slug: "padel-live", title: "Padel TOS", sport: "padel", startsAt: "2026-08-23T18:00:00Z", endsAt: "2026-08-23T20:00:00Z" },
      { slug: "tennis-live", title: "Tennis TOS", sport: "tennis", startsAt: "2026-08-23T18:00:00Z", endsAt: "2026-08-23T20:00:00Z" },
    ]} />);
    expect(screen.getByRole("heading", { name: "Kies een TOS-schema" })).toBeVisible();
    expect(screen.getByText("Er is nu geen TOS bezig.")).toBeVisible();
    const links = screen.getAllByRole("link", { name: /Bekijk schema/u });
    expect(links[0]).toHaveAttribute("href", "/live/padel-live");
    expect(links[1]).toHaveAttribute("href", "/live/tennis-live");
    expect(container.textContent).not.toMatch(/ranking|member_id|registration_id|email/u);
  });
});
