import { describe, expect, it } from "vitest";

import { parsePublicSchedule } from "./parser";

const valid = {
  id: "schedule-1",
  event_date: "2026-08-21",
  created_by_name: "Planner",
  start_time: "20:00",
  end_time: "22:00",
  courts: ["Kremer Baan"],
  participants_public: ["Anna"],
  schedule_public: [{
    Ronde: 1,
    Tijd: "20:00–20:20",
    Baan: "Kremer Baan",
    "Team 1": "Anna & Bram",
    "Team 2": "Cato & Daan",
  }],
  is_published: true,
  created_at: "2026-08-20T18:00:00Z",
};

describe("public schedule parser", () => {
  it("normalizes a valid legacy row without optional status fields", () => {
    const parsed = parsePublicSchedule(valid);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rows[0]).toMatchObject({
        Ronde: "1",
        "Team 1": "Anna & Bram",
        Rust: "",
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "",
      });
    }
  });

  it("normalizes legacy rows with one or two optional status fields", () => {
    const rows = [
      { ...valid.schedule_public[0], Rust: " Eva " },
      {
        ...valid.schedule_public[0],
        Ronde: 2,
        Rust: null,
        "Nog niet aanwezig": "Fleur",
      },
    ];
    const parsed = parsePublicSchedule({ ...valid, schedule_public: rows });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rows[0].Rust).toBe("Eva");
      expect(parsed.value.rows[1].Rust).toBe("");
      expect(parsed.value.rows[1]["Nog niet aanwezig"]).toBe("Fleur");
      expect(parsed.value.rows[1]["Niet meer beschikbaar"]).toBe("");
    }
  });

  it("accepts and normalizes a fully populated public schedule row", () => {
    const parsed = parsePublicSchedule({
      ...valid,
      schedule_public: [{
        ...valid.schedule_public[0],
        Rust: "Eva",
        "Nog niet aanwezig": "Fleur",
        "Niet meer beschikbaar": "Gijs",
      }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rows[0]).toEqual({
        Ronde: "1",
        Tijd: "20:00–20:20",
        Baan: "Kremer Baan",
        "Team 1": "Anna & Bram",
        "Team 2": "Cato & Daan",
        Rust: "Eva",
        "Nog niet aanwezig": "Fleur",
        "Niet meer beschikbaar": "Gijs",
      });
    }
  });

  it.each([
    ["empty object", {}],
    ["null", null],
    ["array", []],
    ["string", "row"],
    ["number", 42],
    ["boolean", true],
  ])("rejects a malformed %s schedule row", (_label, row) => {
    expect(parsePublicSchedule({ ...valid, schedule_public: [row] }).ok).toBe(false);
  });

  it.each(["Ronde", "Tijd", "Baan", "Team 1", "Team 2"])(
    "rejects a row with a missing or empty required %s field",
    (field) => {
      const missing = { ...valid.schedule_public[0] } as Record<string, unknown>;
      delete missing[field];
      expect(parsePublicSchedule({ ...valid, schedule_public: [missing] }).ok).toBe(false);
      expect(parsePublicSchedule({
        ...valid,
        schedule_public: [{ ...valid.schedule_public[0], [field]: "   " }],
      }).ok).toBe(false);
    },
  );

  it.each([
    ["unpublished", { ...valid, is_published: false }],
    ["non-object payload", null],
    ["invalid date text", { ...valid, event_date: "morgen" }],
    ["impossible calendar date", { ...valid, event_date: "2026-99-99" }],
    ["invalid leap day", { ...valid, event_date: "2025-02-29" }],
    ["schedule object", { ...valid, schedule_public: {} }],
    ["schedule string", { ...valid, schedule_public: "rows" }],
    ["schedule null", { ...valid, schedule_public: null }],
    ["courts object", { ...valid, courts: {} }],
    ["courts null", { ...valid, courts: null }],
    ["courts with nested object", { ...valid, courts: [{ name: "Baan" }] }],
    ["participants object", { ...valid, participants_public: {} }],
    ["participants null", { ...valid, participants_public: null }],
    ["participants with number", { ...valid, participants_public: [123] }],
    ["null created_at", { ...valid, created_at: null }],
    ["invalid created_at", { ...valid, created_at: "nooit" }],
  ])("rejects malformed external JSON: %s", (_label, payload) => {
    expect(parsePublicSchedule(payload).ok).toBe(false);
  });

  it("accepts a real leap day and a valid schedule with zero matches", () => {
    const parsed = parsePublicSchedule({
      ...valid,
      event_date: "2028-02-29",
      schedule_public: [],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rows).toEqual([]);
    }
  });
});
