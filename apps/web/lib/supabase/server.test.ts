import { describe, expect, it, vi } from "vitest";

import { serverCookieAdapter, type ServerCookieStore } from "./server";

describe("Supabase SSR server cookie adapter", () => {
  it("reads and writes all official SSR cookie operations", () => {
    const store: ServerCookieStore = {
      getAll: vi.fn().mockReturnValue([{ name: "session", value: "value" }]),
      set: vi.fn(),
    };
    const adapter = serverCookieAdapter(store);
    expect(adapter.getAll()).toEqual([{ name: "session", value: "value" }]);
    adapter.setAll([
      { name: "session", value: "new", options: { path: "/" } },
      { name: "expired", value: "", options: { maxAge: 0, path: "/" } },
    ]);
    expect(store.set).toHaveBeenCalledWith("session", "new", { path: "/" });
    expect(store.set).toHaveBeenCalledWith("expired", "", { maxAge: 0, path: "/" });
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
