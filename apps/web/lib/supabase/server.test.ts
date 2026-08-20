import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { serverCookieAdapter, type ServerCookieStore } from "./server";

describe("Supabase SSR server cookie adapter", () => {
  it("uses the central runtime-origin cookie contract", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/supabase/server.ts"), "utf8");
    expect(source).toContain("readAppRuntimeConfig()");
    expect(source).toContain("authCookieOptionsForOrigin(config.appBaseUrl)");
    expect(source).not.toMatch(/domain\s*:|httpOnly\s*:/u);
  });

  it("reads and writes all official SSR cookie operations", () => {
    const store: ServerCookieStore = {
      getAll: vi.fn().mockReturnValue([{ name: "session", value: "value" }]),
      set: vi.fn(),
    };
    const adapter = serverCookieAdapter(store);
    expect(adapter.getAll()).toEqual([{ name: "session", value: "value" }]);
    adapter.setAll([
      {
        name: "session",
        value: "new",
        options: { path: "/", sameSite: "lax", secure: true },
      },
      {
        name: "expired",
        value: "",
        options: { maxAge: 0, path: "/", sameSite: "lax", secure: true },
      },
    ]);
    expect(store.set).toHaveBeenCalledWith("session", "new", {
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(store.set).toHaveBeenCalledWith("expired", "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("does not fail when a read-only Server Component rejects cookie writes", () => {
    const adapter = serverCookieAdapter({
      getAll: () => [],
      set: () => { throw new Error("read only"); },
    });
    expect(() => adapter.setAll([{ name: "session", value: "new", options: {} }]))
      .not.toThrow();
  });
});
