# Event-scoped plannerworkflow

De Next.js-beheerroute `/beheer/tos/<slug>` is de enige ingang voor de nieuwe padelplannerworkflow. De browser levert uitsluitend bewerkbare plannerwaarden en niet-identificerende locators. Next.js herlaadt voor iedere mutation de staffaccountcontext, het event en de actuele draft via een request-scoped Supabase-client met publishable key, eigen JWT en RLS/RPC-authorisatie.

## Private draft en import

`tos_event_planner_drafts` bevat één private draft per TOS-event. Directe toegang voor `authenticated` is ingetrokken. `staff_event_planner_draft(uuid)` verzorgt de begrensde read en `staff_save_event_planner_draft(...)` gebruikt een oplopende revision als compare-and-swap. Auditvelden komen uitsluitend uit `auth.uid()` en het eigen actieve staffprofiel.

Registratie-import is identity-first. De server matcht een bestaande gekoppelde rij op `member_id`, behoudt haar interne `row_id` en actualiseert naam, ranking en beschikbaarheid. Afgemelde of geblokkeerde registraties verwijderen nooit stilzwijgend handmatige rijen. Een gelijknamige legacyrij zonder identiteit wordt als conflict gemeld. Private `member_id`, `user_id` en registratievelden worden niet aan de browser geserialiseerd.

## Plannerengine

De FastAPI-service is uitsluitend een interne HTTP-adapter rond de rootmodule `planner.py`. Caddy publiceert geen plannerroute. Next.js stuurt spelersnamen, rankings, beschikbaarheid, banen, instellingen, een server-generated seed en een contextfingerprint naar `http://planner-api:8000`. Cookies, JWT's, Supabaseconfiguratie, event-ID's en persoonsgegevens buiten de plannerinput gaan niet mee. FastAPI heeft geen egress- of Supabasetoegang.

## Schemaopslag en publicatie

Een gegenereerd voorstel wordt eerst read-only in de staffinterface getoond. Bij privé opslaan stuurt de browser alleen eventslug, draftrevision, seed en het door FastAPI uitgegeven checkpoint. Next.js herlaadt event, draft en courts en maakt dezelfde contextfingerprint. FastAPI verifieert de HMAC, invoerbinding en geldigheid, speelt uitsluitend de gekozen deterministische zoekpositie opnieuw af en controleert de exacte resulthash; alleen dat serverresultaat gaat naar `staff_save_event_schedule(...)`. Er is geen seed-only fallback en browser-schemagegevens zijn verboden.

## WEB-10.3.2 execution- en checkpointcontract

Snel/Normaal/Uitgebreid behouden hun bestaande werkcaps en krijgen respectievelijk 5/9/13 seconden monotone zoektijd. Next.js wacht maximaal 22 seconden (9 seconden marge boven het maximale zoekbudget). De huidige synchrone Uvicorn-route heeft geen afzonderlijke request-timeout; er wordt geen niet-bestaande serverlimiet geclaimd. Checks vinden plaats vóór restarts, rondes, toestanden en iedere acht kandidaatpogingen. Alleen complete resultaten worden volgens de bestaande eindscore bewaard. Legacy callers zonder tijdsbudget behouden hun deterministische werkcaps. Scoringgewichten blijven gelijk.

Het checkpoint bevat uitsluitend versie, keyed input/result fingerprints, restart/kandidaatpositie, optimalisatiestatus, vervaltijd en nonce. De context bindt het volledige server-loaded event (inclusief id/slug), draft (inclusief revision/speleridentiteiten/settings) en courts; de API bindt bovendien het volledige engineverzoek. Een proceslokale willekeurige HMAC-sleutel voorkomt vervalsing zonder extra secretsconfiguratie. Checkpoints vervallen na 15 minuten, na API-herstart of na één replaypoging. De huidige service draait één Uvicorn-worker; meer replicas/workers vereisen eerst een gedeeld signing/replay-contract. De begrensde consumed-nonceadministratie faalt gesloten bij capaciteitstekort. Een mislukte replay/save vereist opnieuw genereren. Publicatie blijft apart.

Replay heeft opnieuw een executiondeadline: onvoldoende tijd geeft een fout, nooit een ander voorstel. `optimization_completed` en `search_checkpoint` zijn private diagnostics; elapsed wall-clocktijd wordt niet in het reproduceerbare resultaat opgenomen. Relevante event/draft/courtwijzigingen maken het checkpoint ongeldig, naast de bestaande revision/CAS-controle.

Structurele invoerfouten blijven HTTP 422 met concrete diagnostics. Geen resultaat vóór deadline is `SEARCH_DEADLINE_REACHED` (504). Onverwachte enginefouten zijn `PLANNER_INTERNAL_ERROR` (500 intern, 502 richting browser). Transporttimeout (504), onbereikbaarheid (503), malformed response (502) en ongeldig checkpoint (409) blijven aparte technische categorieën. Geen automatische dure diagnoseprobes na deadline. Disconnect-cancellation is niet toegevoegd aan de synchrone threadpoolroute: werk kan na disconnect tot de eigen deadline doorlopen, maar nooit onbegrensd verder optimaliseren. Geen thread-killing, queue, nieuwe dependency of databasewijziging.

De database leidt creator, eventmetadata, private spelers, publieke deelnemersnamen en `schedule_public` zelf af. De publieke projectie bevat uitsluitend ronde, tijd, baan, teams en aanwezigheidsstatussen. Ranking, teamniveau, teamverschil, identitymetadata, statistieken en diagnostics blijven privé. Een schema is standaard niet gepubliceerd. Alleen de maker of een actieve admin kan via `staff_set_schedule_published(...)` publiceren of intrekken; publiceren trekt een eerdere publicatie voor hetzelfde event atomair in.

Legacy schedules zonder `event_id` blijven geldig. Er is geen delete-, tennisplanner-, Excel- of handmatige schema-editflow toegevoegd.
