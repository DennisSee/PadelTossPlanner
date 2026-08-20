# WEB-4B: TOS self-service

WEB-4B maakt `/tos` het ingelogde participantoverzicht en `/tos/<slug>` een
begrensde openbare eventdeeplink. Anonieme bezoekers lezen daar uitsluitend de
openbare eventprojectie `id,slug,title,sport,starts_at,ends_at,signup_deadline,status`.
Een geldige Auth-returnroute gebruikt exact dezelfde slugvalidator; na OTP of
Google keert de gebruiker daardoor terug naar het bedoelde event.

## Identity, capability en servergrens

AUTH-2 blijft leidend: membership geeft participantrechten en `profiles.role`
geeft uitsluitend staffrechten. Een actief profiel met een gekoppeld, actief en
goedgekeurd `club_members`-record kan deelnemen, onafhankelijk van participant-,
planner- of adminrol. Een inactief profiel krijgt nooit onboarding aangeboden,
ook niet wanneer `member_id` ontbreekt.

Alle TOS-reads en -writes gebruiken server-side één Supabase SSR-client met de
publishable key, actuele Auth-cookie, eigen JWT en RLS. De browser beheert alleen
formulierstate en verstuurt een same-origin POST. Er is geen service-roleclient.
Onboarding roept uitsluitend `self_onboard_member(p_display_name)` aan. Veilige
sociale namen komen uitsluitend uit
`participant_event_attendee_names(p_event_id)`; registrations of leden van
anderen worden niet direct gelezen.

De twee mutationroutes eisen een Origin die exact gelijk is aan `APP_BASE_URL`,
herladen op dezelfde client claims, accountcontext, event en eigen registratie,
en antwoorden alleen met begrensde meldingscodes in een 303-redirect. Onbekende
velden, dubbele waarden, bestanden en identityvelden worden geweigerd.

## Registrationcontract

Een INSERT bevat alleen `event_id,response,available_from,available_until`. Een
UPDATE bevat alleen `response,available_from,available_until` en wordt gefilterd
op de server-read registration-ID, event-ID en geverifieerde user-ID. De webapp
gebruikt geen upsert en geen delete; afmelden bewaart de rij met `declined` en
lege availability.

De bestaande writegrens blijft exact `status = open` en een ontbrekende of nog
niet verstreken deadline. WEB-4B voegt bewust geen `ends_at`-writegrens toe.
Beschikbaarheid wordt in `Europe/Amsterdam` gevalideerd en naar UTC omgezet,
inclusief events over middernacht en fail-closed DST-overgangen. De tijdinputs
hebben `step=60`: iedere minuut is kiesbaar. Dit is uitsluitend UX; server en
database accepteren iedere geldige `HH:mm` binnen het eventwindow.

## Overzicht en testcontract

`Mijn komende TOS` bevat eigen attending- én declined-registrations. `Nog
aanmelden` bevat chronologisch alleen open events zonder enige eigen rij. Een
eventuele namenpreview toont maximaal vier via de names-RPC teruggegeven namen;
een fout bij één event maakt de andere kaarten niet onbruikbaar.

Vitest dekt slug/returnpaths, parsers, tijden, repositorypayloads, formulier- en
mutationgrenzen. De lokale stateful PostgREST/Auth-mock oefent de SSR-client en
RLS-vorm zonder remote Supabase. De brede Playwright-eindgate loopt voor WEB-4B
uitsluitend op `phone-390` en `desktop-1440`. De lokale migrations en volledige
pgTAP/RLS-suite worden pas eenmaal in de definitieve eindgate uitgevoerd, niet
tussendoor.
