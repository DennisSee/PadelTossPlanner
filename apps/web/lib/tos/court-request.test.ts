import { describe, expect, it } from "vitest";

import { parseCreateCourt, parseUpdateCourt } from "./court-request";

function form(fields: Record<string, string>): FormData {
  const value = new FormData();
  for (const [key, entry] of Object.entries(fields)) value.set(key, entry);
  return value;
}

describe("court mutation request contract", () => {
  it("accepteert uitsluitend functionele create- en updatevelden", () => {
    expect(parseCreateCourt(form({ sport: "tennis", name: "  Centre Court  ", active: "true", sort_order: "15" })))
      .toEqual({ sport: "tennis", name: "Centre Court", active: true, sortOrder: 15 });
    expect(parseUpdateCourt(form({ court_id: "c9000000-0000-4000-8000-000000000001", name: "Kremer", active: "false", sort_order: "20" })))
      .toEqual({ courtId: "c9000000-0000-4000-8000-000000000001", name: "Kremer", active: false, sortOrder: 20 });
  });

  it("weigert authorityvelden, duplicaten, files en onbekende sporten", () => {
    for (const authority of ["id", "created_by", "updated_by", "role", "user_id"]) {
      const value = form({ sport: "padel", name: "Baan", active: "true", sort_order: "10", [authority]: "forged" });
      expect(() => parseCreateCourt(value)).toThrow();
    }
    const duplicate = form({ sport: "padel", name: "Baan", active: "true", sort_order: "10" });
    duplicate.append("name", "Andere");
    expect(() => parseCreateCourt(duplicate)).toThrow();
    expect(() => parseCreateCourt(form({ sport: "squash", name: "Baan", active: "true", sort_order: "10" }))).toThrow();
  });

  it("weigert onveilige naam, UUID, status en sortering", () => {
    expect(() => parseCreateCourt(form({ sport: "padel", name: "Baan\nNoord", active: "true", sort_order: "10" }))).toThrow();
    expect(() => parseUpdateCourt(form({ court_id: "attacker", name: "Baan", active: "true", sort_order: "10" }))).toThrow();
    expect(() => parseCreateCourt(form({ sport: "padel", name: "Baan", active: "yes", sort_order: "10" }))).toThrow();
    expect(() => parseCreateCourt(form({ sport: "padel", name: "Baan", active: "true", sort_order: "10001" }))).toThrow();
  });
});
