import { describe, expect, it, vi } from "vitest";

import { generatePlannerSchedule, PlannerApiError, PlannerGenerationError, readPlannerApiBaseUrl } from "./client";

const result = {
  seed: 7,
  schedule: [{
    Ronde: 1, Tijd: "20:00 - 20:20", Baan: "Kremer Baan", "Team 1": "A & B",
    "Niveau T1": 4, "Team 2": "C & D", "Niveau T2": 3, Teamverschil: 1,
    Rust: "Niemand", "Nog niet aanwezig": "Niemand", "Niet meer beschikbaar": "Niemand",
  }],
  statistics: [{ Speler: "A", Ranking: 4 }],
  diagnostics: { rounds: 1 },
};

describe("internal planner API client", () => {
  it("accepts only credential-free internal or loopback HTTP origins", () => {
    expect(readPlannerApiBaseUrl({ PLANNER_API_BASE_URL: "http://planner-api:8000", APP_ENV: "staging" } as unknown as NodeJS.ProcessEnv)).toBe("http://planner-api:8000");
    expect(readPlannerApiBaseUrl({ PLANNER_API_BASE_URL: "http://127.0.0.1:8000", APP_ENV: "test" } as unknown as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:8000");
    expect(readPlannerApiBaseUrl({
      PLANNER_API_BASE_URL: "http://127.0.0.1:8000", APP_ENV: "staging",
      APP_BASE_URL: "http://127.0.0.1:31000", SUPABASE_URL: "http://127.0.0.1:45391",
    } as unknown as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:8000");
    expect(() => readPlannerApiBaseUrl({ PLANNER_API_BASE_URL: "http://127.0.0.1:8000", APP_ENV: "staging", APP_BASE_URL: "https://test.example", SUPABASE_URL: "http://127.0.0.1:54321" } as unknown as NodeJS.ProcessEnv)).toThrow(PlannerApiError);
    for (const value of ["https://planner-api:8000", "http://user:pass@planner-api:8000", "http://evil.test", "http://planner-api:8000/path?token=x"]) {
      expect(() => readPlannerApiBaseUrl({ PLANNER_API_BASE_URL: value, APP_ENV: "staging" } as unknown as NodeJS.ProcessEnv)).toThrow(PlannerApiError);
    }
  });

  it("sends one bounded request without cookies, JWT or Supabase headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    await expect(generatePlannerSchedule({} as never, { baseUrl: "http://planner-api:8000", fetcher, timeoutMilliseconds: 50 })).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.stringify(init)).not.toMatch(/cookie|authorization|supabase|jwt/iu);
    expect(init.cache).toBe("no-store");
  });

  it("fails closed for malformed or unsuccessful responses", async () => {
    await expect(generatePlannerSchedule({} as never, { baseUrl: "http://planner-api:8000", fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...result, private: true }), { status: 200 })) })).rejects.toThrow(PlannerApiError);
    await expect(generatePlannerSchedule({} as never, { baseUrl: "http://planner-api:8000", fetcher: vi.fn().mockResolvedValue(new Response("private upstream detail", { status: 500 })) })).rejects.toThrow(PlannerApiError);
  });

  it("keeps a valid structured no-solution result separate from transport errors", async () => {
    const failure = {
      error: "NO_VALID_SCHEDULE",
      summary: "Geen geldig schema gevonden.",
      diagnostics: [{
        code: "LEVEL_MIX_TOO_RESTRICTIVE", severity: "likely",
        message: "Met een hogere niveaumix vond de planner wel een geldig schema.",
        suggested_change: "Verhoog Niveaumix van 80 naar 100.",
        setting: "level_mix", current_value: 80, suggested_value: 100,
      }],
      probes_run: 1,
    };
    const promise = generatePlannerSchedule({} as never, {
      baseUrl: "http://planner-api:8000",
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(failure), { status: 422 })),
    });
    await expect(promise).rejects.toMatchObject({
      name: "PlannerGenerationError",
      failure: expect.objectContaining({ code: "NO_VALID_SCHEDULE", probesRun: 1 }),
    } satisfies Partial<PlannerGenerationError>);
  });

  it("rejects unknown diagnostic codes and control characters", async () => {
    for (const diagnostic of [
      { code: "RAW_SQL", severity: "likely", message: "raw", suggested_change: "change", setting: null, current_value: null, suggested_value: null },
      { code: "NO_COURTS", severity: "blocking", message: "unsafe\ntext", suggested_change: "change", setting: null, current_value: null, suggested_value: null },
    ]) {
      await expect(generatePlannerSchedule({} as never, {
        baseUrl: "http://planner-api:8000",
        fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
          error: "INVALID_PLANNER_INPUT", summary: "Invalid", diagnostics: [diagnostic], probes_run: 0,
        }), { status: 422 })),
      })).rejects.toThrow(PlannerApiError);
    }
  });
});
