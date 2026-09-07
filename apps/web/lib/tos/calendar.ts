import type { TosEvent } from "./types";

const escapeText = (value: string) => value.replace(/\\/gu, "\\\\").replace(/\r\n|\r|\n/gu, "\\n").replace(/;/gu, "\\;").replace(/,/gu, "\\,");
const stamp = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");

// RFC 5545: fold by UTF-8 octets, never through a multibyte character.
function fold(line: string): string {
  let result = "";
  let width = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (width + size > 75) { result += "\r\n "; width = 1; }
    result += character;
    width += size;
  }
  return result;
}

export function eventCalendar(event: TosEvent, canonicalOrigin: string, now: Date): string {
  const url = new URL(`/tos/${event.slug}`, canonicalOrigin);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TC Zuid//TOS//NL", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${event.slug}@${url.hostname}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`, "DESCRIPTION:Momentopname van je TOS-avond. Controleer de website voor wijzigingen.",
    `URL:${url.href}`, "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
