import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readAppRuntimeConfig } from "../config/public-supabase";
import { authCookieOptionsForOrigin } from "./cookie-options";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  try {
    const config = readAppRuntimeConfig();
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookieOptions: authCookieOptionsForOrigin(config.appBaseUrl),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    });
    await supabase.auth.getClaims();
  } catch {
    // Publieke routes blijven beschikbaar bij ontbrekende Auth-configuratie of
    // een ongeldige/tijdelijk niet verifieerbare sessie. Routeguards vertrouwen
    // uitsluitend hun eigen getClaims-controle en accountcontext.
  }
  return response;
}
