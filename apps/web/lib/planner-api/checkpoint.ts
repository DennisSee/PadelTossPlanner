import "server-only";
import { createHash } from "node:crypto";
import type { ClubCourt, PlannerDraft, TosEvent } from "../tos/types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

// Only server-loaded context enters this fingerprint. The API also binds the full engine payload.
export function plannerCheckpointContext(event: TosEvent, draft: PlannerDraft, courts: readonly ClubCourt[]): string {
  return createHash("sha256").update(JSON.stringify(canonical({ version: 1, event, draft, courts }))).digest("hex");
}
