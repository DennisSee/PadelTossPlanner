import { NextResponse, type NextRequest } from "next/server";

import { readAppBaseUrl } from "../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let appBaseUrl: string;
  try {
    appBaseUrl = readAppBaseUrl();
  } catch {
    return new Response("Uitloggen is tijdelijk niet beschikbaar.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(appBaseUrl).origin) {
    return new Response("Ongeldig verzoek.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL("/", appBaseUrl), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
