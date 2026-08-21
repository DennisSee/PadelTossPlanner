import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { StaffEventConflictError, StaffEventDataError, StaffTosEventRepository } from "./staff-repository";
import { TOS_EVENT_SELECT, type TosEvent } from "./types";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "padel-tos-20260828-a1b2c3d4",
  title: "TOS vrijdag",
  sport: "padel",
  starts_at: "2026-08-28T18:00:00Z",
  ends_at: "2026-08-28T20:00:00Z",
  signup_deadline: null,
  status: "draft",
  max_participants: 24,
};

function fakeClient(result: { data?: unknown; error?: unknown; status?: number }) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq", "limit", "insert", "update"]) {
    builder[method] = (...args: unknown[]) => { calls.push([method, ...args]); return builder; };
  }
  builder.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const from = vi.fn((table: string) => { calls.push(["from", table]); return builder; });
  return { calls, client: { from } as unknown as SupabaseClient };
}

describe("staff TOS event repository", () => {
  it("lists every visible staff event with the exact safe projection", async () => {
    const fake = fakeClient({ data: [row], error: null });
    await expect(new StaffTosEventRepository(fake.client).listEvents()).resolves.toHaveLength(1);
    expect(fake.calls).toEqual([
      ["from", "tos_events"],
      ["select", TOS_EVENT_SELECT],
      ["order", "starts_at", { ascending: false }],
    ]);
    expect(TOS_EVENT_SELECT).not.toContain("*");
    expect(TOS_EVENT_SELECT).not.toMatch(/created_by|created_at|updated_at/u);
  });

  it("loads only derived capacity through the narrow staff RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{
      event_id: row.id,
      max_participants: 24,
      placed_count: 20,
      available_count: 4,
      waitlist_count: 2,
    }], error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(new StaffTosEventRepository(client).capacitySummaries()).resolves.toEqual([{
      eventId: row.id,
      maxParticipants: 24,
      placedCount: 20,
      availableCount: 4,
      waitlistCount: 2,
    }]);
    expect(rpc).toHaveBeenCalledWith("staff_event_capacity_summaries");
  });

  it("creates with exactly eight database-derived-safe columns", async () => {
    const fake = fakeClient({ data: null, error: null });
    await new StaffTosEventRepository(fake.client).createEvent({
      slug: row.slug,
      title: row.title,
      sport: "padel",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      signupDeadline: null,
      status: "draft",
      maxParticipants: 24,
    });
    expect(fake.calls.find(([method]) => method === "insert")?.[1]).toEqual({
      slug: row.slug,
      title: row.title,
      sport: "padel",
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      signup_deadline: null,
      status: "draft",
      max_participants: 24,
    });
  });

  it("updates exactly four mutable fields through server-read id and slug", async () => {
    const fake = fakeClient({ data: null, error: null });
    const event = {
      id: row.id, slug: row.slug, title: row.title, sport: "padel", startsAt: row.starts_at,
      endsAt: row.ends_at, signupDeadline: null, status: "draft",
      maxParticipants: 24,
    } satisfies TosEvent;
    await new StaffTosEventRepository(fake.client).updateEvent(event, {
      title: "Changed", signupDeadline: null, status: "open", maxParticipants: 32,
    });
    expect(fake.calls).toEqual([
      ["from", "tos_events"],
      ["update", { title: "Changed", signup_deadline: null, status: "open", max_participants: 32 }],
      ["eq", "id", row.id],
      ["eq", "slug", row.slug],
    ]);
    expect(JSON.stringify(fake.calls)).not.toMatch(/upsert|delete/u);
  });

  it("fails closed for malformed/multiple rows and safely categorizes conflicts", async () => {
    const malformed = fakeClient({ data: [{ ...row, status: "bad" }], error: null });
    await expect(new StaffTosEventRepository(malformed.client).listEvents())
      .rejects.toBeInstanceOf(StaffEventDataError);
    const multiple = fakeClient({ data: [row, row], error: null });
    await expect(new StaffTosEventRepository(multiple.client).eventBySlug(row.slug))
      .rejects.toBeInstanceOf(StaffEventDataError);
    const conflict = fakeClient({ error: { code: "23505", message: "private" } });
    await expect(new StaffTosEventRepository(conflict.client).createEvent({
      slug: row.slug, title: row.title, sport: "padel", startsAt: row.starts_at,
      endsAt: row.ends_at, signupDeadline: null, status: "draft",
      maxParticipants: 24,
    })).rejects.toBeInstanceOf(StaffEventConflictError);
  });
});
