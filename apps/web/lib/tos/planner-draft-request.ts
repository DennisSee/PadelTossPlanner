import type { EditablePlannerPlayer, PlannerCourt, PlannerDraftWrite, PlannerSearchProfile } from "./types";
import { PLANNER_COURTS, PLANNER_SEARCH_PROFILES } from "./types";
import { InvalidPlannerDraftError } from "./planner-draft";
import { isTosEventSlug } from "./slug";

const ALLOWED_SAVE_FIELDS = new Set([
  "slug", "expected_revision", "players", "selected_courts", "match_minutes",
  "rest_minutes", "search_profile", "allow_repeat_partners", "level_mix",
  "team_difference_tolerance",
]);

function oneText(form: FormData, name: string, maximum: number): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].length > maximum ||
      /[\u0000-\u001f\u007f]/u.test(values[0])) throw new InvalidPlannerDraftError();
  return values[0];
}

function exactFields(form: FormData, allowed: ReadonlySet<string>): void {
  if ([...form.keys()].some((key) => !allowed.has(key))) throw new InvalidPlannerDraftError();
}

function integer(text: string, minimum: number, maximum: number): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(text)) throw new InvalidPlannerDraftError();
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new InvalidPlannerDraftError();
  return value;
}

function number(text: string, minimum: number, maximum: number): number {
  if (!/^(?:\d+)(?:\.\d+)?$/u.test(text)) throw new InvalidPlannerDraftError();
  const value = Number(text);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new InvalidPlannerDraftError();
  return value;
}

function editablePlayers(text: string): Omit<EditablePlannerPlayer, "linked">[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new InvalidPlannerDraftError(); }
  if (!Array.isArray(value) || value.length > 160) throw new InvalidPlannerDraftError();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new InvalidPlannerDraftError();
    const row = entry as Record<string, unknown>;
    const keys = Object.keys(row).sort().join(",");
    if (keys !== "availableFrom,availableUntil,included,name,ranking,rowId") throw new InvalidPlannerDraftError();
    if (typeof row.rowId !== "string" || typeof row.name !== "string" || typeof row.ranking !== "number" ||
        typeof row.included !== "boolean" || typeof row.availableFrom !== "string" || typeof row.availableUntil !== "string") {
      throw new InvalidPlannerDraftError();
    }
    return {
      rowId: row.rowId, name: row.name, ranking: row.ranking, included: row.included,
      availableFrom: row.availableFrom, availableUntil: row.availableUntil,
    };
  });
}

export type PlannerDraftSaveRequest = Readonly<{
  slug: string;
  expectedRevision: number;
  players: readonly Omit<EditablePlannerPlayer, "linked">[];
  settings: Omit<PlannerDraftWrite, "players">;
}>;

export function parsePlannerDraftSaveRequest(form: FormData): PlannerDraftSaveRequest {
  exactFields(form, ALLOWED_SAVE_FIELDS);
  const slug = oneText(form, "slug", 80);
  if (!isTosEventSlug(slug)) throw new InvalidPlannerDraftError();
  const selectedCourtsText = oneText(form, "selected_courts", 500);
  let selectedCourts: unknown;
  try { selectedCourts = JSON.parse(selectedCourtsText); } catch { throw new InvalidPlannerDraftError(); }
  if (!Array.isArray(selectedCourts) || selectedCourts.length < 1 || selectedCourts.length > 4 ||
      selectedCourts.some((court) => typeof court !== "string" || !PLANNER_COURTS.includes(court as never)) ||
      new Set(selectedCourts).size !== selectedCourts.length) throw new InvalidPlannerDraftError();
  const searchProfile = oneText(form, "search_profile", 20);
  if (!PLANNER_SEARCH_PROFILES.includes(searchProfile as never)) throw new InvalidPlannerDraftError();
  const allowRepeat = oneText(form, "allow_repeat_partners", 5);
  if (allowRepeat !== "true" && allowRepeat !== "false") throw new InvalidPlannerDraftError();
  const matchMinutes = integer(oneText(form, "match_minutes", 2), 15, 30);
  if (![15, 20, 25, 30].includes(matchMinutes)) throw new InvalidPlannerDraftError();
  return Object.freeze({
    slug,
    expectedRevision: integer(oneText(form, "expected_revision", 16), 0, Number.MAX_SAFE_INTEGER),
    players: editablePlayers(oneText(form, "players", 100_000)),
    settings: Object.freeze({
      selectedCourts: selectedCourts as PlannerCourt[],
      matchMinutes: matchMinutes as 15 | 20 | 25 | 30,
      restMinutes: integer(oneText(form, "rest_minutes", 2), 0, 30),
      searchProfile: searchProfile as PlannerSearchProfile,
      allowRepeatPartners: allowRepeat === "true",
      levelMix: integer(oneText(form, "level_mix", 3), 0, 100),
      teamDifferenceTolerance: number(oneText(form, "team_difference_tolerance", 8), 0, 1.5),
    }),
  });
}

export function parsePlannerLocatorRequest(form: FormData): Readonly<{ slug: string; expectedRevision: number }> {
  exactFields(form, new Set(["slug", "expected_revision"]));
  const slug = oneText(form, "slug", 80);
  if (!isTosEventSlug(slug)) throw new InvalidPlannerDraftError();
  return Object.freeze({
    slug,
    expectedRevision: integer(oneText(form, "expected_revision", 16), 0, Number.MAX_SAFE_INTEGER),
  });
}

export function parsePlannerLocatorJson(value: unknown): Readonly<{ slug: string; expectedRevision: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidPlannerDraftError();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== "expected_revision,slug" || typeof row.slug !== "string" ||
      !isTosEventSlug(row.slug) || !Number.isSafeInteger(row.expected_revision) || typeof row.expected_revision !== "number" || row.expected_revision < 1) {
    throw new InvalidPlannerDraftError();
  }
  return Object.freeze({ slug: row.slug, expectedRevision: row.expected_revision });
}

export function parseScheduleSaveRequest(form: FormData): Readonly<{ slug: string; expectedRevision: number; generationSeed: number }> {
  exactFields(form, new Set(["slug", "expected_revision", "generation_seed"]));
  const slug = oneText(form, "slug", 80);
  if (!isTosEventSlug(slug)) throw new InvalidPlannerDraftError();
  return Object.freeze({
    slug,
    expectedRevision: integer(oneText(form, "expected_revision", 16), 1, Number.MAX_SAFE_INTEGER),
    generationSeed: integer(oneText(form, "generation_seed", 20), 0, Number.MAX_SAFE_INTEGER),
  });
}

export function parseSchedulePublishRequest(form: FormData): Readonly<{ slug: string; scheduleId: string; published: boolean }> {
  exactFields(form, new Set(["slug", "schedule_id", "published"]));
  const slug = oneText(form, "slug", 80);
  const scheduleId = oneText(form, "schedule_id", 36);
  const published = oneText(form, "published", 5);
  if (!isTosEventSlug(slug) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(scheduleId) ||
      (published !== "true" && published !== "false")) throw new InvalidPlannerDraftError();
  return Object.freeze({ slug, scheduleId, published: published === "true" });
}
