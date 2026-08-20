# WEB-5A: TOS-eventbeheer

WEB-5A migreert het eerste TOS-beheeronderdeel naar de Next.js-webapp. De bestaande Streamlit-omgeving blijft tijdens de migratie beschikbaar als fallback.

## Autorisatie en databasegrens

De pagina `/beheer` en beide mutationroutes vereisen een actief `profiles`-record met `role = planner` of `role = admin`. Een clublidkoppeling is geen staffvoorwaarde. De webapp gebruikt uitsluitend de publishable Supabase-configuratie en de eigen gebruikers-JWT; RLS en de kolomgrants uit WEB-5A0 blijven de laatste autoriteit. Er is geen service-roleclient.

Staff leest uitsluitend `id,slug,title,sport,starts_at,ends_at,signup_deadline,status`. `created_by` en timestamps komen niet terug in de webprojectie. Create schrijft uitsluitend `slug,title,sport,starts_at,ends_at,signup_deadline,status`; de database leidt `created_by` af uit `auth.uid()`. Update schrijft uitsluitend `title,signup_deadline,status`, gefilterd op het server-read event-ID en de immutable slug.

## Invoer en tijd

De browser levert bij create alleen titel, sport, eventdatum, start, einde, optionele deadline en status. De server maakt een cryptografisch willekeurige slug in de vorm `<sport>-tos-<YYYYMMDD>-<8 hex>`; titel en persoonsgegevens worden niet in de slug verwerkt. Bij update is de slug alleen een immutable locator.

Lokale invoer wordt strikt als `Europe/Amsterdam` geïnterpreteerd. Niet-bestaande en ambigue DST-tijden falen gesloten. Create gebruikt één eventdatum en vereist dat de eindtijd later is dan de starttijd; een event over middernacht valt buiten WEB-5A. De deadline mag leeg zijn of uiterlijk gelijk zijn aan de start. De vijfminutenstap in HTML is alleen UX: de server accepteert iedere geldige minuutwaarde.

## Gedrag en scope

Alle vier statussen (`draft`, `open`, `closed`, `cancelled`) kunnen onderling worden gewijzigd. Er is geen delete, upsert of automatische statuswijziging. Na iedere write leest de server het event opnieuw en vergelijkt de opgeslagen publieke velden voordat een succesmelding verschijnt.

WEB-5A leest geen registraties, deelnemers, leden of rankings en bevat geen planner- of FastAPI-integratie. Deelnemersbeheer en plannerinput horen bij een latere milestone. De publieke `/tos`- en `/tos/<slug>`-flows blijven ongewijzigd.
