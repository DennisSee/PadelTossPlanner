import type { PublicSchedule, PublicScheduleRow } from "./types";

type ParseResult =
  | { ok: true; value: PublicSchedule }
  | { ok: false };

const ROW_FIELDS = [
  "Ronde",
  "Tijd",
  "Baan",
  "Team 1",
  "Team 2",
  "Rust",
  "Nog niet aanwezig",
  "Niet meer beschikbaar",
] as const;

const REQUIRED_ROW_FIELDS = ["Ronde", "Tijd", "Baan", "Team 1", "Team 2"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function requiredText(value: unknown): string | null {
  const text = normalizedText(value);
  return text.length > 0 ? text : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    const text = entry.trim();
    if (text) {
      result.push(text);
    }
  }
  return result;
}

function scheduleRows(value: unknown): PublicScheduleRow[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result: PublicScheduleRow[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }

    const row = Object.fromEntries(
      ROW_FIELDS.map((field) => [field, normalizedText(entry[field])]),
    ) as PublicScheduleRow;
    if (REQUIRED_ROW_FIELDS.some((field) => row[field].length === 0)) {
      return null;
    }
    result.push(row);
  }
  return result;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function parsePublicSchedule(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return { ok: false };
  }

  const id = requiredText(value.id);
  const eventDate = requiredText(value.event_date);
  const createdAt = requiredText(value.created_at);
  const courts = stringArray(value.courts);
  const participants = stringArray(value.participants_public);
  const rows = scheduleRows(value.schedule_public);

  if (
    id === null ||
    eventDate === null ||
    !isCalendarDate(eventDate) ||
    createdAt === null ||
    Number.isNaN(Date.parse(createdAt)) ||
    value.is_published !== true ||
    courts === null ||
    participants === null ||
    rows === null
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      id,
      eventDate,
      createdByName: normalizedText(value.created_by_name),
      startTime: normalizedText(value.start_time),
      endTime: normalizedText(value.end_time),
      courts,
      participants,
      rows,
      isPublished: true,
      createdAt,
    },
  };
}
