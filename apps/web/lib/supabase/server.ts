import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicSupabaseConfig } from "../config/public-supabase";

export type ServerCookie = Readonly<{ name: string; value: string }>;
export type ServerCookieStore = {
  getAll(): ServerCookie[];
  set(name: string, value: string, options?: CookieOptions): void;
};

export function serverCookieAdapter(cookieStore: ServerCookieStore) {
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (
      cookiesToSet: ReadonlyArray<{
        name: string;
        value: string;
        options: CookieOptions;
      }>,
    ) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components mogen geen cookies schrijven. Proxy verzorgt de
        // vernieuwing; Route Handlers en Server Actions kunnen wel schrijven.
      }
    },
  };
}

export async function createServerSupabaseClient() {
  const config = readPublicSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: serverCookieAdapter(cookieStore),
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
