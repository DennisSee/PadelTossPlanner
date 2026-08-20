"use client";

import { createBrowserClient } from "@supabase/ssr";

import { browserAuthCookieOptions } from "./cookie-options";

export type BrowserSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export function createBrowserSupabaseClient(
  config: BrowserSupabaseConfig,
  runtimeOrigin?: string,
) {
  return createBrowserClient(config.url, config.publishableKey, {
    cookieOptions: browserAuthCookieOptions(runtimeOrigin),
    auth: {
      experimental: { appendPkceFlowIdToRedirects: true },
    },
  });
}
