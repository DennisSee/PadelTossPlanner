import { expect, it } from "vitest";
import { eventCalendar } from "./calendar";
import type { TosEvent } from "./types";
const event = { slug: "padel-tos-20260907-abcd1234", title: "Tennis, padel; café\\club\nAvond", startsAt: "2026-09-07T20:07:00+02:00", endsAt: "2026-09-07T22:00:00+02:00" } as TosEvent;
it("exports UTC, stable UID, canonical URL and escaped text without invented location", () => {
  const value = eventCalendar(event, "https://tos.example.test", new Date("2026-09-01T12:00:00Z"));
  expect(value).toContain("DTSTART:20260907T180700Z\r\nDTEND:20260907T200000Z");
  expect(value).toContain("DTSTAMP:20260901T120000Z");
  expect(value).toContain(`UID:${event.slug}@tos.example.test`);
  expect(value).toContain(`URL:https://tos.example.test/tos/${event.slug}`);
  expect(value).toContain("SUMMARY:Tennis\\, padel\\; café\\\\club\\nAvond");
  expect(value).not.toContain("LOCATION:");
});
it("folds long UTF-8 lines and handles winter offsets", () => {
  const value = eventCalendar({ ...event, title: "ë".repeat(120), startsAt: "2026-12-01T20:07:00+01:00" }, "https://tos.example.test", new Date());
  expect(value).toContain("DTSTART:20261201T190700Z");
  for (const line of value.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(value.replace(/\r\n /gu, "")).toContain(`SUMMARY:${"ë".repeat(120)}`);
});
