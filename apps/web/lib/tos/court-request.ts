import { isUuid } from "./parser";
import type { TosSport } from "./types";

const CONTROL = /[\u0000-\u001f\u007f]/u;

export class InvalidCourtRequestError extends Error {}

function exact(form: FormData, keys: readonly string[]): void {
  const actual = [...form.keys()].sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new InvalidCourtRequestError();
}
function text(form: FormData, key: string, max: number): string {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].length > max || CONTROL.test(values[0])) {
    throw new InvalidCourtRequestError();
  }
  return values[0];
}

function order(form: FormData): number {
  const raw = text(form, "sort_order", 5);
  if (!/^\d{1,5}$/u.test(raw)) throw new InvalidCourtRequestError();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10000) throw new InvalidCourtRequestError();
  return value;
}

function active(form: FormData): boolean {
  const value = text(form, "active", 5);
  if (value !== "true" && value !== "false") throw new InvalidCourtRequestError();
  return value === "true";
}

function name(form: FormData): string {
  const value = text(form, "name", 80).trim();
  if (!value) throw new InvalidCourtRequestError();
  return value;
}

export function parseCreateCourt(form: FormData) {
  exact(form, ["sport", "name", "active", "sort_order"]);
  const sport = text(form, "sport", 6);
  if (sport !== "padel" && sport !== "tennis") throw new InvalidCourtRequestError();
  return Object.freeze({ sport: sport as TosSport, name: name(form), active: active(form), sortOrder: order(form) });
}

export function parseUpdateCourt(form: FormData) {
  exact(form, ["court_id", "name", "active", "sort_order"]);
  const courtId = text(form, "court_id", 36);
  if (!isUuid(courtId)) throw new InvalidCourtRequestError();
  return Object.freeze({ courtId, name: name(form), active: active(form), sortOrder: order(form) });
}
