# WEB-3A: Supabase SSR en e-mail-OTP

WEB-3A voegt één cookiegebaseerde Supabase-sessie toe aan de Next.js-website. De
bestaande Streamlit-passwordlogin blijft tijdens de migratie zelfstandig bestaan.

## Clients en runtimeconfiguratie

- De browserclient gebruikt `createBrowserClient` uit `@supabase/ssr` voor
  `signInWithOtp` en `verifyOtp`.
- De serverclient wordt per request aangemaakt met `createServerClient`, de
  requestcookies en `cache: no-store`. Hij leest alleen data van de ingelogde
  gebruiker onder de bestaande RLS-regels.
- `proxy.ts` roept alleen de session-refreshhelper aan. Die gebruikt
  `getClaims()`, zet vernieuwde cookies op zowel request als response en doet
  geen profiel-, member- of rolequery.

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` en `APP_BASE_URL` worden pas bij het
starten van de server gelezen. De Dockerimage blijft daardoor voor staging en
productie gelijk. Alleen de URL en publishable key worden als gevalideerde props
aan de interactieve logincomponent gegeven. Een publishable key is ontworpen
voor publieke clients; de databasebeveiliging komt uit JWT + RLS. Er bestaat
bewust geen service-role- of secret-keyclient in de nieuwe webapp.

## Sessies en identity

De officiële SSR-helper bewaart Auth-sessies in cookies. Tokens staan nooit in
URL's of applicatielogs en er is geen eigen tokenopslag of encryptielaag.
Server-side routebescherming vertrouwt op `getClaims()`, niet op de ongeverifieerde
user uit `getSession()`. Proxy vernieuwt cookies; Server Components mogen
cookiewrites rustig overslaan omdat Proxy die taak uitvoert.

Authenticated pagina's (`/account`, `/tos`, `/beheer` en `/auth/*`) zijn
dynamisch en krijgen `private, no-store`. `/api/health` valt buiten Proxy en
blijft volledig onafhankelijk van Supabase.

## OTP-flow

`/login` normaliseert het e-mailadres naar lowercase en vraagt met
`shouldCreateUser: true` één code aan voor nieuwe en bestaande accounts. Na de
generieke bevestiging bewaart de UI de code als string, accepteert alleen cijfers
en hardcodet geen zes- of achtcijferige lengte. Supabase `verifyOtp(type="email")`
blijft de autoriteit. De resendknop verschijnt na een lokale countdown van 60
seconden; server-side rate limits blijven leidend. Fouten worden vertaald naar
korte categorieën zonder accountstatus, e-mail, OTP, token of raw providerfout.

Na een geldige code navigeert de browser volledig naar `/auth/complete`. Deze
serverroute valideert opnieuw claims, accountcontext en de returnroute. Alleen
`/tos`, `/account`, `/beheer` en `/live` zijn toegestaan; alle absolute,
protocol-relative, encoded of onbekende doelen vallen terug op `/tos`.
`/beheer` valt voor een niet-staffaccount eveneens terug op `/tos`.

## AUTH-2 accountcontext

De serverrepository selecteert exact:

- `profiles`: `id,display_name,role,active,member_id`;
- `club_members`: `id,display_name,approval_status,active`.

De user-id komt uitsluitend uit geverifieerde claims. De publishable key en eigen
JWT activeren `profiles_select_own` en `club_members_select_linked`; er is geen
cross-userparameter en geen `select("*")`.

Membership bepaalt `canParticipate`; `profiles.role` bepaalt staffrechten:

| Toestand | Deelnemen | Plannen | Admin |
| --- | --- | --- | --- |
| approved member + participant | ja | nee | nee |
| approved member + planner | ja | ja | nee |
| approved member + admin | ja | ja | ja |
| staff zonder member | nee | volgens role | volgens role |
| pending/rejected/inactive/inconsistent | nee | volgens actief profiel + role | volgens actief profiel + role |
| inactief of onbekend profiel | nee | nee | nee |

`/account` is beschikbaar voor iedere geauthenticeerde identity. `/tos` toont in
WEB-3A alleen de capabilitystatus. `/beheer` vereist `canPlan` in servercode.
Verborgen navigatielinks zijn nooit de authorizationlaag. Eén POST naar
`/auth/logout` beëindigt de lokale Supabase-sessie en verwijdert de cookies.

## Test- en stagingcontract

Unit- en componenttests dekken returnroutes, capabilitymatrix, minimale
repositoryprojecties, cookieadapters, OTP, countdown, veilige fouten en guards.
Browsertests blijven zonder echte remote Supabase draaien. De bestaande lokale
test-supportserver bootst alleen de benodigde Auth- en PostgREST-contracten na,
maakt per testrun nieuwe JWT-testsleutels en laat de productiecode de echte
`@supabase/ssr`-clients gebruiken; er is geen Auth-bypass. Waar de lokale
Supabase-stack beschikbaar is, worden de bestaande migrations en RLS-tests
opnieuw vanaf nul uitgevoerd. Een echte OTP-mailboxflow blijft een expliciete
stagingcontrole, omdat de browsertestserver geen Supabase-mailaflevering test.

Staging vereist naast de bestaande publieke Supabaseconfiguratie:

```dotenv
APP_BASE_URL=https://test-tos.oddbounce.nl
```

Preflight valideert deze origin zonder waarden te tonen. Smoke-tests controleren
`/login` en de drie protected redirects read-only.

## Buiten WEB-3A

Deze fase voegt geen migration, onboardingformulier, registratieflow,
profielbewerking, event-/ledenbeheer, plannerintegratie, OAuth of passkeys toe.
WEB-3B kan Google OAuth boven op dezelfde browser-, Proxy-, completion- en
returnroutearchitectuur plaatsen.
