import { beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.hoisted(() =>
  vi.fn(
    (
      _url: string,
      _key: string,
      _options?: {
        cookieOptions?: Readonly<{
          path: string;
          sameSite: string;
          secure: boolean;
        }>;
      },
    ) => {
      void _url;
      void _key;
      void _options;
      return { kind: "browser-client" };
    },
  ),
);

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

import { createBrowserSupabaseClient } from "./browser";

const config = {
  url: "https://project.example.test",
  publishableKey: "sb_publishable_fixture",
};

describe("Supabase SSR browser client", () => {
  beforeEach(() => createBrowserClient.mockClear());

  it("uses the central HTTPS cookie contract without domain or HttpOnly", () => {
    createBrowserSupabaseClient(config, "https://test-tos.oddbounce.nl");
    expect(createBrowserClient).toHaveBeenCalledWith(
      config.url,
      config.publishableKey,
      {
        cookieOptions: { path: "/", sameSite: "lax", secure: true },
      },
    );
    const options = createBrowserClient.mock.calls[0]?.[2]?.cookieOptions;
    expect(options).not.toHaveProperty("domain");
    expect(options).not.toHaveProperty("httpOnly");
  });

  it("uses non-Secure cookies only on local HTTP", () => {
    createBrowserSupabaseClient(config, "http://localhost:3000");
    expect(createBrowserClient.mock.calls[0]?.[2]?.cookieOptions).toEqual({
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
});
