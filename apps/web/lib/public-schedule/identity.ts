export type LivePlayer = Readonly<{ key: string; name: string }>;
export type LiveSlot = Readonly<{ key: string; state: "playing" | "rest" | "not_arrived" | "unavailable"; court: string | null; team: number | null }>;
export type IdentityRound = Readonly<{ number: number; starts_at: string; ends_at: string; slots: readonly LiveSlot[] }>;
export type LiveIdentity = Readonly<{ players: readonly LivePlayer[]; rounds: readonly IdentityRound[] }>;
export const OPAQUE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join() === keys.sort().join();

export function parseLiveIdentity(value: unknown): LiveIdentity | null {
  if (!record(value) || !exact(value, ["players", "rounds"]) || !Array.isArray(value.players) || !Array.isArray(value.rounds)) return null;
  const keys = new Set<string>();
  for (const player of value.players) {
    if (!record(player) || !exact(player, ["key", "name"]) || typeof player.key !== "string" || !OPAQUE_KEY.test(player.key) || keys.has(player.key) ||
        typeof player.name !== "string" || !player.name.trim() || player.name.length > 120 || /[\u0000-\u001f\u007f]/u.test(player.name)) return null;
    keys.add(player.key);
  }
  let previousEnd = -Infinity;
  let previousNumber = 0;
  for (const round of value.rounds) {
    if (!record(round) || !exact(round, ["number", "starts_at", "ends_at", "slots"]) || typeof round.number !== "number" || !Number.isSafeInteger(round.number) || round.number <= previousNumber ||
        typeof round.starts_at !== "string" || typeof round.ends_at !== "string" || !Array.isArray(round.slots)) return null;
    const start = Date.parse(round.starts_at), end = Date.parse(round.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < previousEnd) return null;
    previousEnd = end; previousNumber = round.number;
    const seen = new Set<string>();
    const courts = new Map<string, number[]>();
    for (const slot of round.slots) {
      if (!record(slot) || !exact(slot, ["key", "state", "court", "team"]) || typeof slot.key !== "string" || !keys.has(slot.key) || seen.has(slot.key)) return null;
      seen.add(slot.key);
      if (slot.state === "playing") {
        if (typeof slot.court !== "string" || !slot.court.trim() || slot.court.length > 120 || (slot.team !== 1 && slot.team !== 2)) return null;
        courts.set(slot.court, [...(courts.get(slot.court) ?? []), slot.team]);
      } else if (!["rest", "not_arrived", "unavailable"].includes(String(slot.state)) || slot.court !== null || slot.team !== null) return null;
    }
    if (seen.size !== keys.size || [...courts.values()].some((teams) => teams.length !== 4 || teams.filter((team) => team === 1).length !== 2)) return null;
  }
  return value as unknown as LiveIdentity;
}
