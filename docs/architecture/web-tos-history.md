# WEB-7 — officiële TOS-historie en clubcontacten

## Bron van waarheid

`registrations` beschrijft inschrijving en beschikbaarheid, niet deelname. TOS-historie ontstaat daarom uitsluitend uit een officieel gepubliceerd, opgeslagen schema nadat het event is afgelopen. Publiceren of opnieuw publiceren bouwt de genormaliseerde private snapshot atomair opnieuw op; de officiële publicatie verwijderen verwijdert de snapshot. Geannuleerde events en wachtlijstinschrijvingen verschijnen niet.

Bij het opslaan van een schema maakt de server uit de actuele planner-draft en generatoruitvoer een private identiteitsprojectie. De database controleert de rijen, namen en koppelingen opnieuw. Alleen een exacte koppeling met de eigen eventregistratie mag een `member_id` in de snapshot opleveren; handmatige gasten blijven bewust zonder ledenidentiteit. De publieke schemaprojectie verandert niet en bevat geen leden-ID's, rankings of contactgegevens.

## Beveiliging

De private historietabellen hebben RLS en geen directe rechten voor `anon` of `authenticated`. De webapp gebruikt uitsluitend de publishable key, de eigen Auth-cookie/JWT en smalle `SECURITY DEFINER`-RPC's met een lege `search_path`:

- `my_tos_history()` geeft alleen de eigen officiële historie;
- `my_tos_clubmates()` en `my_shared_tos_history(uuid)` beperken relaties tot werkelijk samen gespeelde officiële wedstrijden;
- contact-RPC's valideren beide leden en de gedeelde wedstrijd opnieuw;
- `my_accepted_history_contact(uuid)` leest een e-mailadres live uit Auth, maar uitsluitend bij een nog geldige, geaccepteerde relatie.

Er is geen publieke ledenlijst. E-mail, telefoon, ranking, beschikbaarheid en interne identifiers worden niet als sociale projectie gepubliceerd. Een e-mailadres staat pas in de server-rendered pagina nadat beide leden toestemming hebben gegeven. Toestemming kan worden ingetrokken.

## Capabilities en beheer

AUTH-2 blijft leidend: een actief, goedgekeurd clublidmaatschap geeft participantrechten; `profiles.role` bepaalt uitsluitend staffrechten. Daardoor kan een planner of admin met een geldig clublidmaatschap dezelfde historie gebruiken.

Alleen een actieve admin kan via `admin_set_profile_role(uuid,text)` de accountrol van een ander gekoppeld profiel wijzigen. De RPC accepteert alleen `participant`, `planner` of `admin`, wijzigt uitsluitend `profiles.role` en blokkeert iedere eigen rolwijziging. Een planner ziet de rol read-only. Clubstatus, sportprofielen en ranking blijven afzonderlijke begrippen.

## Bewuste grenzen

WEB-7 voegt geen speelgeschiedenis uit oude registraties toe, reconstrueert geen wachtlijst of oude identiteit en bevat geen backfill-/compatibilityarchitectuur. Er is geen telefoonboek, chat, vrije zoekdirectory, export of publieke historie. Bestaande migrations blijven ongewijzigd; de twee WEB-7-migrations bouwen alleen het nieuwe eindmodel bovenop de huidige schema-HEAD.
