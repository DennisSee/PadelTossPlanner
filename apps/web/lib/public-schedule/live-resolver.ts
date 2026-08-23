import type { PublicLiveCandidate } from "./types";

export type LiveResolution =
  | Readonly<{ kind: "redirect"; slug: string }>
  | Readonly<{ kind: "selection"; candidates: readonly PublicLiveCandidate[] }>
  | Readonly<{ kind: "empty" }>;

export function resolveLiveCandidates(candidates: readonly PublicLiveCandidate[], now: Date): LiveResolution {
  const time = now.getTime();
  const ordered = [...candidates].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
    Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.slug.localeCompare(b.slug));
  const current = ordered.filter((event) => Date.parse(event.startsAt) <= time && time < Date.parse(event.endsAt));
  if (current.length) return current.length === 1 ? { kind: "redirect", slug: current[0].slug } : { kind: "selection", candidates: current };
  const future = ordered.filter((event) => Date.parse(event.startsAt) > time);
  if (future.length) {
    const earliest = Date.parse(future[0].startsAt);
    const tied = future.filter((event) => Date.parse(event.startsAt) === earliest);
    return tied.length === 1 ? { kind: "redirect", slug: tied[0].slug } : { kind: "selection", candidates: tied };
  }
  const past = ordered.filter((event) => Date.parse(event.endsAt) <= time)
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || a.slug.localeCompare(b.slug));
  if (!past.length) return { kind: "empty" };
  const latest = Date.parse(past[0].endsAt);
  const tied = past.filter((event) => Date.parse(event.endsAt) === latest);
  return tied.length === 1 ? { kind: "redirect", slug: tied[0].slug } : { kind: "selection", candidates: tied };
}
