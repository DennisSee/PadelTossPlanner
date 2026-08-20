"use client";

import { createBrowserClient } from "@supabase/ssr";

export type BrowserSupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export function createBrowserSupabaseClient(config: BrowserSupabaseConfig) {
  return createBrowserClient(config.url, config.publishableKey);
}
