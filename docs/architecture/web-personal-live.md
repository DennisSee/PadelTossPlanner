# WEB-10.4 — persoonlijke liveweergave

## Publicatie-identiteit en dreigingsmodel

Migration `20260907120000_participant_live_identity.sql` verandert geen bestaande
migrations of tabelrechten. `public_event_live_schedule(text)` krijgt één extra
`live_identity`-projectie met spelers (`key`, `name`) en rondeposities
(`number`, `starts_at`, `ends_at`, `slots`: `key`, `state`, `court`, `team`).
De opaque key is het bestaande willekeurige `tos_history_event_players.id`.
De publicatieprocedure bouwt deze snapshot opnieuw bij publicatie. Dit is geen
member-ID, Auth-user-ID of private planner-row-ID en geen clubbrede identifier.
Namen en rondeposities waren reeds publiek; rankings en private metadata blijven
afwezig. Bekende snapshotkeys zijn geen toegangsbewijs tot een privécontract.

`my_published_event_schedule_identity(text)` retourneert uitsluitend
`{ schedule_id, player_key }` voor `auth.uid()` via een actief profiel en een
actief, approved clublid. Er is geen role-gate: staff zonder membership krijgt
geen participantmapping. De publicatie moet actueel, uniek en niet geannuleerd
zijn en de speler moet in de snapshot deelnemen. Bij ontbrekende mapping wordt
niets teruggegeven. Unieke constraints voorkomen ambiguïteit binnen een snapshot.
Alle drie functies zijn SQL/STABLE/SECURITY DEFINER met lege search_path;
de interne helper is niet uitvoerbaar door anon/authenticated. Alleen authenticated
mag de own-RPC uitvoeren; de publieke projection blijft anon/authenticated.

De webhelper gebruikt de bestaande publishable-key/caller-cookieclient, maximaal
één aanvullende RPC per actuele eventpagina. Hij valideert responsevelden,
publicatie-ID en opaque key. De UI vereist bovendien dat de key in de strikt
gevalideerde publieke identiteit voorkomt. Een race met republicatie, malformed
data of een RPC-fout schakelt persoonlijke prioritering uit, niet het publieke
schema. Er is nooit een automatische naam- of e-mailfallback. Bestaande handmatige
naamselectie blijft beschikbaar zonder own-mapping; die is geen Auth-authority.

## Presentatie

Alleen tijdens de eventperiode verschijnt automatisch de eigen Nu/Hierna-context.
Partner en tegenstanders volgen keys en teamnummers, ook bij dubbele namen.
Iedereen/andere speler kiezen blijft mogelijk en het volledige fixture board blijft
zichtbaar. Op mobiel is er een directe Mijn live-schema-ankeractie. Rust is een
expliciete toestand. De rondeklok kondigt alleen een nieuwe ronde aan; maximaal één
volgende persoonlijke ronde staat boven het board.

Toekomstige/afgelopen schema's worden niet als actief Live gepresenteerd.
Er is geen fictieve update-timestamp. De bestaande 30-secondenklok ververst alleen
de tijd; Schema verversen herlaadt expliciet de actuele publicatie. Geen realtime
subscription of achtergrond-pollingarchitectuur is toegevoegd.

Live/account/historie hebben compactere taakheaders; homepage blijft merkgericht.
Functionele namen blijven Inter; displaykoppen gebruiken Barlow Condensed.
De publieke stagingbadge is verwijderd zonder APP_ENV of deploymentconfig te wijzigen.
De compacte planningkwaliteit gebruikt ongewijzigd de backend quality_summary en
verschijnt uitsluitend bij gemelde compromissen.

## Agenda

De eventdetailpagina biedt Toevoegen aan agenda alleen voor attending + placed,
niet voor een geannuleerd event. GET `/tos/[slug]/agenda` controleert opnieuw
membership en de eigen registratie/plaatsing via JWT/RLS. De download is private,
no-store, nosniff; fouten bevatten geen backenddetails. UID gebruikt de stabiele
eventslug en canonical host. UTC DTSTART/DTEND behouden de aangeleverde instant,
inclusief zomer/wintertijd. DTSTAMP is exporttijd, geen publicatie-updateclaim.
RFC 5545-escaping en UTF-8-regelvouwing voorkomen inhoudsinjectie. Geen e-mail,
member-ID, fictieve locatie, externe kalenderverbinding of automatische synchronisatie.
De download is nadrukkelijk een momentopname.

## Lokale verificatie

Gerichte pgTAP dekt privileges, membership, publicatie, dubbele namen en veilige
projectie. Webtests dekken identity-fail-closed, Nu/rust, agenda en veilige downloads.
De persoonlijke Chromium-matrix loopt expliciet op 360/390/1024/1440 binnen het
desktopproject; duplicaten in de andere projecten worden bewust overgeslagen.
Visuele screenshots blijven uitsluitend lokale testartefacten buiten Git.
