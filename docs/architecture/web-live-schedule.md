# WEB-2: publiek Live TOS-schema

WEB-2 migreert uitsluitend de openbare scheduleweergave naar Next.js. De bestaande Streamlit-app, planner-engine, Auth-flow en database-objecten blijven ongewijzigd.

## Route- en datastroom

- `/` is de publieke T.C. Zuid-startpagina en verwijst naar `/live`.
- `/live` is dynamisch server-rendered en haalt bij iedere gewone paginarequest maximaal één gepubliceerd schema op.
- `/api/health` blijft een Supabase-onafhankelijke livenesscheck.
- `/api/planner/health` blijft via Caddy naar FastAPI `/health` gaan.

De server-only repository gebruikt `@supabase/supabase-js` met uitsluitend `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY`. Auth-sessionopslag, tokenrefresh en browserstorage staan uit. De browser ontvangt alleen de reeds veilig geprojecteerde scheduledata als serialiseerbare props.

De query selecteert exact:

```text
id,event_date,created_by_name,start_time,end_time,courts,participants_public,schedule_public,is_published,created_at
```

Daarna volgen `is_published = true`, `event_date desc`, `created_at desc` en `limit 1`. RLS en de bestaande kolomgrants blijven de primaire begrenzing. Private spelersdata, rankings, statistieken en diagnostics worden niet opgevraagd.

## Runtimeconfiguratie

Kopieer op staging `deploy/staging/.env.example` naar een niet-gecommit `deploy/staging/.env` en vul alleen het geïsoleerde testproject in:

```dotenv
APP_ENV=staging
SITE_ADDRESS=test-tos.oddbounce.nl
SUPABASE_URL=https://JOUW-TESTPROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_VERVANG_DIT
```

Er is geen service-role- of secret-keycontract. Ontbrekende of ongeldige configuratie geeft op `/live` een rustige foutstatus; de build en `/api/health` blijven onafhankelijk van Supabase.

## Netwerkgrens

- Caddy: `edge` + intern `application`, als enige met hostpoorten 80/443.
- Next.js: intern `application` + niet-intern `web-egress`, zonder hostpoort.
- FastAPI: uitsluitend intern `application`.

Zo kan alleen de Next.js-server outbound HTTPS gebruiken voor de publieke Supabase-read. De planner-API blijft zonder internet- of Supabasetoegang.

## Tijd en interactie

Rondetijden worden als clubtijd geïnterpreteerd in `Europe/Amsterdam` met `date-fns-tz`. De implementatie ondersteunt zomer-/wintertijd en rondes over middernacht zonder een vaste UTC-offset. Alleen de klok en current/next-weergave verversen iedere dertig seconden; Supabase wordt niet gepolld.

De naamkeuze wordt na hydratatie gevalideerd en uitsluitend lokaal onder `tc-zuid-tos/preferred-player` bewaard. Een onbekende oude waarde valt terug op `Iedereen`. Deelnemersnamen worden door React als tekst gerenderd.

Browseropslag is nadrukkelijk best-effort. Wanneer lezen of schrijven van `localStorage` door browserbeleid of privacyinstellingen faalt, blijft de pagina werken met `Iedereen` als initiële keuze en een tijdelijke voorkeur in het huidige paginageheugen. Er is geen cookie of serveropslag voor deze voorkeur.

## Publiek rowcontract en foutafhandeling

WEB-2A sluit de twee reviewblockers door browseropslag als best-effort te behandelen en iedere publieke wedstrijdrow vóór rendering inhoudelijk te valideren.

Een geldige publieke wedstrijdrow heeft bruikbare waarden voor `Ronde`, `Tijd`, `Baan`, `Team 1` en `Team 2`. De legacy-statusvelden `Rust`, `Nog niet aanwezig` en `Niet meer beschikbaar` mogen ontbreken of leeg zijn en worden dan naar een lege string genormaliseerd. Niet-objectrows, lege rows en rows zonder een vereist wedstrijdveld maken de schedulepayload ongeldig. De server toont dan de bestaande generieke veilige foutstatus; er wordt geen gedeeltelijke `— vs —`-wedstrijd weergegeven.

Livevensters zijn halfopen: `start <= nu < einde`. Exact op de start is een ronde actief; exact op het einde niet meer. De tweeminutenwaarschuwing is inclusief exact twee minuten. `event_date` en rondetijden zijn clubtijd in `Europe/Amsterdam`; datumovergangen en zomer-/wintertijd worden via de timezonedatabase bepaald.

## Stagingbewijs dat nog openstaat

Er is lokaal bewust geen verbinding met Supabase gemaakt. De eerste echte end-to-endread vindt pas plaats nadat staging met de URL en publishable key van het geïsoleerde testproject is geconfigureerd. Daarbij moeten de nieuwste gepubliceerde selectie, RLS/kolomgrants, lege toestand en malformed fouttoestand via `/live` worden bevestigd.

De lokale omgeving voor deze review had geen beschikbare Docker CLI. Daarom is `gw_priority` niet op aanname toegevoegd. Vóór deployment moet `docker compose config` op de doelomgeving bevestigen dat Caddy zijn default egress via `edge` en web via `web-egress` krijgt, terwijl `application` intern en de planner zonder externe egress blijft.

WEB-2 bevat nog geen login, OTP, OAuth, deelnemerregistratie, profiel, staffbeheer of plannerintegratie.

## Lokale browser-quality-gate

WEB-2B voegt onder `apps/web/e2e/` een Playwright Test-suite toe. De suite bouwt de
Next.js-productionapp, start een test-only PostgREST-server uit `apps/web/test-support/`
en laat de echte server-only repository via de echte `@supabase/supabase-js`-querycode
lezen. Alleen de fictieve publishable key `sb_publishable_e2e_only` wordt gebruikt.
De mock accepteert uitsluitend de tien publieke kolommen, de gepubliceerde filter,
de twee aflopende sorteringen en `limit 1`; ieder afwijkend contract laat de suite
falen zonder headers of keys te loggen.

Installeer en voer lokaal uit vanuit `apps/web/`:

```sh
pnpm install --frozen-lockfile
pnpm test:e2e:install
pnpm test:e2e
```

Alleen Chromium wordt geïnstalleerd. De browsermatrix is 360×800, 390×844,
430×932, 768×1024 en 1440×900. De suite controleert homepage en livepagina,
persoonlijke selectie, statusweergave, opslagfalen, escaping, toetsenbordbediening,
responsive overflow en reduced motion. Screenshots, trace en video worden alleen
bij een fout of retry bewaard en zijn Git- en Docker-buildcontext-ignored.

Dit bewijst de lokale browserketen en het publieke querycontract. Het bewijst niet
dat URL, publishable key, RLS, kolomgrants, DNS, TLS of gepubliceerde data van het
echte test-Supabase-project juist zijn; die punten worden afzonderlijk op staging
gevalideerd.

## Read-only stagingverificatie

Voer vóór een handmatige rollout in `deploy/staging/` uit:

```sh
./preflight.sh
```

Dit script controleert zonder wijzigingen de vereiste tools en env-aanwezigheid,
`APP_ENV=staging`, de gerenderde Compose-topologie, resources, swap, vrije disk,
listeners en Git-commit. Het print geen env-waarden en start, stopt of bouwt niets.

Voer na een expliciet uitgevoerde deployment uit:

```sh
./smoke-test.sh https://test-tos.oddbounce.nl
```

De smoke-test gebruikt normale TLS- en hostnameverificatie (nooit insecure mode),
controleert `/`, `/live` en beide exacte healthcontracten, en weigert raw
stacktraces of private schedulemarkers. Ook dit script is read-only en print geen
volledige HTML of configuratie. Beide scripts vervangen geen handmatige controle
van de actuele stagingdata en voeren zelf geen deployment uit.
