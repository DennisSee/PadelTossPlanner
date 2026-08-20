import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readPublicSupabaseConfig } from "../config/public-supabase";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  try {
    const config = readPublicSupabaseConfig();
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
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
