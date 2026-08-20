import { describe, expect, it } from "vitest";

import {
  exactTextFields,
  hasExactOrigin,
  InvalidTosRequestError,
  normalizedDisplayName,
  tosRedirect,
} from "./request";

describe("TOS mutation request boundary", () => {
  it("requires the exact configured origin", () => {
    expect(hasExactOrigin(new Request("https://app.example/api", { headers: { origin: "https://app.example" } }), "https://app.example"))
      .toBe(true);
    expect(hasExactOrigin(new Request("https://app.example/api", { headers: { origin: "https://evil.example" } }), "https://app.example"))
      .toBe(false);
    expect(hasExactOrigin(new Request("https://app.example/api"), "https://app.example")).toBe(false);
  });

  it("accepts exact text fields and rejects duplicates, files, extra fields and controls", () => {
    const good = new FormData();
    good.set("slug", "vrijdag-padel");
    expect(exactTextFields(good, { slug: 80 })).toEqual({ slug: "vrijdag-padel" });

    for (const bad of [
      (() => { const data = new FormData(); data.append("slug", "a"); data.append("slug", "b"); return data; })(),
      (() => { const data = new FormData(); data.set("slug", "vrijdag-padel"); data.set("user_id", "other"); return data; })(),
      (() => { const data = new FormData(); data.set("slug", "bad\rvalue"); return data; })(),
      (() => { const data = new FormData(); data.set("slug", new File(["x"], "x.txt")); return data; })(),
    ]) {
      expect(() => exactTextFields(bad, { slug: 80 })).toThrow(InvalidTosRequestError);
    }
  });

  it("trims and bounds self-onboarding names", () => {
    expect(normalizedDisplayName("  Dennis Seesing  ")).toBe("Dennis Seesing");
    expect(() => normalizedDisplayName(" \n ")).toThrow(InvalidTosRequestError);
    expect(() => normalizedDisplayName("x".repeat(121))).toThrow(InvalidTosRequestError);
  });

  it("redirects only to the typed same-origin destination with finite codes", () => {
    const response = tosRedirect("https://app.example", "/tos/vrijdag-padel", { notice: "registration-created" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/tos/vrijdag-padel?notice=registration-created");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });
});
