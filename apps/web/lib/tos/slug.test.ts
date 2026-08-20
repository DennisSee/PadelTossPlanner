import { describe, expect, it } from "vitest";

import { isTosEventSlug, tosDetailPath } from "./slug";

describe("TOS event slugs", () => {
  it.each(["abc", "vrijdag-padel", "tennis-avond-2026", "a".repeat(80)])(
    "accepts the database slug shape %s",
    (slug) => expect(isTosEventSlug(slug)).toBe(true),
  );

  it.each([
    "ab",
    "a".repeat(81),
    "Hoofdletters",
    "leading-",
    "-leading",
    "double--dash",
    "slash/event",
    "event?query=1",
    "event%2Fescape",
    "event\nnext",
  ])("rejects %s", (slug) => expect(isTosEventSlug(slug)).toBe(false));

  it("builds only validated internal detail paths", () => {
    expect(tosDetailPath("vrijdag-padel")).toBe("/tos/vrijdag-padel");
    expect(() => tosDetailPath("../evil")).toThrow("Ongeldige TOS-eventslug");
  });
});
