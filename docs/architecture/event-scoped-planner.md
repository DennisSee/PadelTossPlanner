# Event-scoped plannerworkflow

De Next.js-beheerroute `/beheer/tos/<slug>` is de enige ingang voor de nieuwe padelplannerworkflow. De browser levert uitsluitend bewerkbare plannerwaarden en niet-identificerende locators. Next.js herlaadt voor iedere mutation de staffaccountcontext, het event en de actuele draft via een request-scoped Supabase-client met publishable key, eigen JWT en RLS/RPC-authorisatie.

## Private draft en import

`tos_event_planner_drafts` bevat één private draft per TOS-event. Directe toegang voor `authenticated` is ingetrokken. `staff_event_planner_draft(uuid)` verzorgt de begrensde read en `staff_save_event_planner_draft(...)` gebruikt een oplopende revision als compare-and-swap. Auditvelden komen uitsluitend uit `auth.uid()` en het eigen actieve staffprofiel.

Registratie-import is identity-first. De server matcht een bestaande gekoppelde rij op `member_id`, behoudt haar interne `row_id` en actualiseert naam, ranking en beschikbaarheid. Afgemelde of geblokkeerde registraties verwijderen nooit stilzwijgend handmatige rijen. Een gelijknamige legacyrij zonder identiteit wordt als conflict gemeld. Private `member_id`, `user_id` en registratievelden worden niet aan de browser geserialiseerd.

## Plannerengine

De FastAPI-service is uitsluitend een interne HTTP-adapter rond de ongewijzigde rootmodule `planner.py`. Caddy publiceert geen plannerroute. Next.js stuurt alleen spelersnamen, rankings, beschikbaarheid, banen, instellingen en een server-generated seed naar `http://planner-api:8000`. Cookies, JWT's, Supabaseconfiguratie, event-ID's en persoonsgegevens buiten de plannerinput gaan niet mee. FastAPI heeft geen egress- of Supabasetoegang.

## Schemaopslag en publicatie

Een gegenereerd voorstel wordt eerst read-only in de staffinterface getoond. Bij privé opslaan stuurt de browser alleen eventslug, draftrevision en seed. Next.js herlaadt de draft en genereert met dezelfde seed opnieuw; alleen dat serverresultaat gaat naar `staff_save_event_schedule(...)`.

De database leidt creator, eventmetadata, private spelers, publieke deelnemersnamen en `schedule_public` zelf af. De publieke projectie bevat uitsluitend ronde, tijd, baan, teams en aanwezigheidsstatussen. Ranking, teamniveau, teamverschil, identitymetadata, statistieken en diagnostics blijven privé. Een schema is standaard niet gepubliceerd. Alleen de maker of een actieve admin kan via `staff_set_schedule_published(...)` publiceren of intrekken; publiceren trekt een eerdere publicatie voor hetzelfde event atomair in.

Legacy schedules zonder `event_id` blijven geldig. Er is geen delete-, tennisplanner-, Excel- of handmatige schema-editflow toegevoegd.
