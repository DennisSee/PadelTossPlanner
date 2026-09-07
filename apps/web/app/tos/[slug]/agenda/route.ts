import { loadAccountContextWithClient } from "../../../../lib/auth/session";
import { readAppBaseUrl } from "../../../../lib/config/public-supabase";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { eventCalendar } from "../../../../lib/tos/calendar";
import { TosRepository } from "../../../../lib/tos/repository";
import { isTosEventSlug } from "../../../../lib/tos/slug";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const missing = () => new Response("Niet beschikbaar", { status: 404, headers });
  if (!isTosEventSlug(slug)) return missing();
  try {
    const origin = readAppBaseUrl();
    const client = await createServerSupabaseClient();
    const account = await loadAccountContextWithClient(client);
    if (!account?.capabilities.canParticipate) return missing();
    const repository = new TosRepository(client);
    const event = await repository.eventBySlug(slug, { openOnly: false });
    if (!event || event.status === "cancelled") return missing();
    const registration = await repository.ownRegistration(event.id, account.identity.userId);
    const position = await repository.ownRegistrationPosition(event.id);
    if (registration?.response !== "attending" || position?.placementStatus !== "placed") return missing();
    return new Response(eventCalendar(event, origin, new Date()), { headers: {
      ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.ics"`,
    } });
  } catch {
    return new Response("Tijdelijk niet beschikbaar", { status: 503, headers });
  }
}
