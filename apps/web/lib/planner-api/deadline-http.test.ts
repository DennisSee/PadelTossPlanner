// @vitest-environment node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { generatePlannerSchedule, PLANNER_HTTP_TIMEOUT_MS } from "./client";
import type { PlannerGenerateRequest } from "./types";

// Real Python search through the real web HTTP client; synthetic data only, no database.
const baseUrl = "http://127.0.0.1:41789";
let server: ReturnType<typeof spawn>;
it("keeps at least five seconds between every server budget and the web timeout", () => {
  const source = readFileSync(resolve(process.cwd(), "../../services/planner-api/app/execution.py"), "utf8");
  const budgets = source.match(/^TIME_BUDGETS = (.+)$/mu);
  expect(budgets).not.toBeNull();
  for (const budget of Object.values(JSON.parse(budgets![1])) as number[]) {
    expect(PLANNER_HTTP_TIMEOUT_MS - budget * 1000).toBeGreaterThanOrEqual(5000);
  }
});
beforeAll(async () => {
  const root = resolve(process.cwd(), "../..");
  const python = resolve(root, "services/planner-api/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  server = spawn(python, ["-m", "uvicorn", "app.main:app", "--app-dir", "services/planner-api", "--host", "127.0.0.1", "--port", "41789", "--no-access-log"],
    { cwd: root, windowsHide: true, stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Local planner could not start");
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Local planner startup timed out");
}, 15_000);
afterAll(async () => {
  if (server && server.exitCode === null) { const stopped = once(server, "exit"); server.kill(); await stopped; }
});

it.each(["A", "B"])("dataset %s returns within the web deadline and replays exactly", async (dataset) => {
  const request: PlannerGenerateRequest = {
    players: [5, 3, 3, 1, 4, 4, 3, 3, 4, 2, 4, 2].map((ranking, index) => ({
      name: `P${String(index).padStart(2, "0")}`, ranking, available_from: "20:00", available_until: "22:00",
    })), courts: ["Kremer", "ZGA/F&F", "PlaySeat"], start_time: "20:00", end_time: "22:00",
    match_minutes: 20, rest_minutes: dataset === "A" ? 5 : 0, search_profile: dataset === "A" ? "Uitgebreid" : "Normaal",
    allow_repeat_partners: dataset === "A", level_mix: 100, tolerance: 1, generation_seed: 2026,
    checkpoint_context: "a".repeat(64),
  };
  const started = performance.now();
  const generated = await generatePlannerSchedule(request, { baseUrl });
  const milliseconds = performance.now() - started;
  expect(milliseconds).toBeLessThan(PLANNER_HTTP_TIMEOUT_MS);
  expect(generated.schedule).toHaveLength(dataset === "A" ? 15 : 18);
  const roundCount = dataset === "A" ? 5 : 6;
  expect(generated.diagnostics.rounds).toBe(roundCount);
  for (let round = 1; round <= roundCount; round++) {
    const rows = generated.schedule.filter((row) => row.Ronde === round);
    expect(rows.map((row) => row.Baan).sort()).toEqual([...request.courts].sort());
    const names = rows.flatMap((row) => [...row["Team 1"].split(" & "), ...row["Team 2"].split(" & ")]);
    expect(names.sort()).toEqual(request.players.map((player) => player.name).sort());
  }
  expect(generated.diagnostics.quality_summary).toEqual(expect.objectContaining({
    partner_repeats: expect.any(Number), opponent_repeats: expect.any(Number),
    max_rest_difference: 0, max_team_difference: expect.any(Number),
  }));
  expect(generated.checkpoint).toBeTruthy();
  const { checkpoint, ...proposal } = generated;
  const replay = await generatePlannerSchedule({ ...request, checkpoint }, { baseUrl });
  expect(replay).toEqual(proposal);
  await expect(generatePlannerSchedule({ ...request, checkpoint }, { baseUrl })).rejects.toMatchObject({ code: "INVALID_CHECKPOINT" });
  process.stdout.write(`Dataset ${dataset}: ${Math.round(milliseconds)}ms; score=${generated.diagnostics.score}; completed=${generated.diagnostics.optimization_completed}; quality=${JSON.stringify(generated.diagnostics.quality_summary)}\n`);
}, 60_000);
