# TOS Padelplanner

Een Streamlit-webapp voor het genereren, opslaan en openbaar delen van gebalanceerde padelschema's.

## Rollen en zichtbaarheid

### Bezoeker zonder account

Een bezoeker ziet alleen:

- de naam en datum van de padelavond;
- de deelnemersnamen;
- het wedstrijdschema;
- de baan- en rustindeling;
- welke spelers in vroege rondes nog niet aanwezig zijn.

Rankings, gemiddelde teamniveaus en spelersstatistieken worden niet openbaar getoond.

### Deelnemer

Een nieuwe Supabase Auth-gebruiker krijgt de rol `participant`. Via de openbare
aanmeldroute kan die gebruiker eenmalig een eigen, sportneutraal clublidprofiel
aanmaken. Standaard is dit profiel direct goedgekeurd; de clubinstelling
`require_member_approval` kan toekomstige onboardings op `pending` laten starten.
Deze instelling verandert nooit automatisch de status van bestaande leden.
Een goedgekeurd, actief lid kan op dezelfde mobiele route de eigen TOS-aanmelding
opslaan of wijzigen totdat het event sluit of de aanmelddeadline verstrijkt.

### Planner

Een planner kan:

- inloggen met e-mailadres en wachtwoord;
- de gedeelde spelerslijst en instellingen opslaan;
- dezelfde clubinvoer op desktop en telefoon terugvinden;
- schema's genereren;
- schema's privé opslaan of openbaar publiceren;
- alle opgeslagen clubschema's bekijken en de publicatie van eigen schema's beheren.

### Beheerder

Een beheerder kan daarnaast:

- planners en andere beheerders aanmaken;
- accounts activeren en deactiveren;
- publicaties van alle planners beheren.

## Technische opbouw

```text
.
├── streamlit_app.py                 # Webinterface, publieke pagina en beheerschermen
├── planner.py                       # Plannings- en optimalisatielogica
├── excel_export.py                  # Exportmodule; nog niet gekoppeld aan de webinterface
├── database.py                      # Supabase Auth en databasefuncties
├── participant_auth.py              # OAuth/PKCE-, OTP- en callbackvalidatie
├── participant_registration.py      # Tijdzone- en formulierlogica voor self-service
├── registration_repository.py       # User-scoped participanttoegang via RLS/RPC
├── supabase/
│   ├── config.toml                  # Lokale Supabase-configuratie
│   └── migrations/                  # Enige bron van waarheid voor het databaseschema
├── requirements.txt                 # Python-packages
├── test_planner.py                  # Rooktest van de planner
├── .gitignore
└── .streamlit/
    ├── config.toml                  # Huisstijl
    └── secrets.toml.example         # Voorbeeld zonder echte sleutels
```

## Waarom Supabase?

Streamlit Community Cloud garandeert niet dat lokaal opgeslagen bestanden behouden blijven. Daarom staan accounts, spelerslijsten en schema's in een externe PostgreSQL-database van Supabase.

De Supabase secret/service key staat uitsluitend in Streamlit Secrets en nooit in
GitHub. Bevoorrechte planner-/adminbewerkingen lopen via een afzonderlijke server-side
beheerclient. User-scoped functionaliteit gebruikt de publishable key en het actuele
Supabase access-token, zodat Row Level Security wordt toegepast.

## 1. Supabase-database voorbereiden

Installeer de Supabase CLI en Docker Desktop. Alle applicatietabellen, functies,
triggers, indexes en beveiligingsinstellingen staan uitsluitend als versiebeheerbare
migrations onder `supabase/migrations/`.

Start de lokale Supabase-stack en bouw de database vanaf nul op:

```bash
supabase start
supabase db reset --local
```

`supabase db reset --local` verwijdert en reconstrueert uitsluitend de lokale database
en past alle migrations in volgorde toe. Gebruik dit commando nooit met remote
databasecredentials.

De migration
`20260817151952_initial_production_baseline.sql` is een baseline van het schema dat al
op de huidige productieomgeving aanwezig is. Voer deze migration daarom **niet opnieuw
uit op de huidige productieomgeving**. Voor een nieuwe, lege omgeving kan de volledige
migrationreeks via een vooraf beoordeelde Supabase CLI- of CI-workflow worden toegepast,
nadat het exacte doelproject expliciet is bevestigd.

Row Level Security begrenst publieke en user-scoped toegang. De openbare schemapagina
kan uitsluitend gepubliceerde, expliciet toegestane kolommen lezen. Participants lezen
hun eigen profiel en registratie via hun eigen Supabase access-token. Alleen expliciete
planner-/adminfuncties gebruiken de server-side secret/service key.

### Leden, goedkeuring en sporten

`auth.users` koppelt via `profiles.member_id` aan precies één `club_members`-identiteit.
Accountactiviteit (`profiles.active`) en clubbrede onboardinggoedkeuring
(`club_members.approval_status`) zijn afzonderlijke beveiligingsbeslissingen. Een
participant kan deze koppeling en status niet rechtstreeks wijzigen; de beperkte
`self_onboard_member`-RPC werkt alleen voor `auth.uid()` en gebruikt de clubinstelling.

Sportafhankelijke gegevens staan in `member_sport_profiles`, met één record per lid en
sport (`padel` of `tennis`). Ranking is daardoor per sport onafhankelijk en wordt niet
door de participant tijdens onboarding ingevuld. `tos_events.sport` maakt ieder nieuw
event expliciet padel of tennis. De huidige planner en interface blijven uitsluitend de
bestaande padelflow uitvoeren; tennisplannerlogica is nog niet geïmplementeerd.

### Nieuwe schemawijzigingen

Maak voor iedere toekomstige schemawijziging een nieuwe migration:

```bash
supabase migration new beschrijvende_naam
```

Wijzig een al toegepaste migration niet. Test iedere nieuwe migration eerst lokaal met
`supabase db reset --local`. Voer schemawijzigingen niet handmatig uit via de SQL Editor
en houd geen tweede schemabestand naast `supabase/migrations/` bij.

## 2. Eerste beheerder aanmaken

De eerste beheerder kan nog niet vanuit de app worden aangemaakt, omdat er nog niemand kan inloggen.

1. Open in Supabase **Authentication → Users**.
2. Kies **Add user**.
3. Vul je eigen e-mailadres en een sterk wachtwoord in.
4. Laat het account direct bevestigen.
5. Open daarna **SQL Editor** en voer uit:

```sql
update public.profiles
set role = 'admin',
    display_name = 'Jouw naam'
where email = 'jouw-email@example.com';
```

Vervang de naam en het e-mailadres door je eigen gegevens.

Na deze bootstrap maak je alle volgende gebruikers vanuit de Streamlit-app aan.

## 3. Supabase-sleutels verzamelen

Open in Supabase de API-instellingen van het project en noteer:

- Project URL;
- Publishable key, of bij een ouder project de anon key;
- Secret key, of bij een ouder project de service_role key.

De secret/service key mag nooit in GitHub worden opgeslagen of in browsercode terechtkomen.

## 4. Streamlit Secrets instellen

Open in Streamlit Community Cloud:

**App → Settings → Secrets**

Plaats daar:

```toml
[supabase]
url = "https://JOUW-PROJECT.supabase.co"
publishable_key = "sb_publishable_..."
secret_key = "sb_secret_..."

[auth]
cookie_password = "minimaal-32-willekeurige-tekens-los-van-supabase"
oauth_redirect_url = "https://JOUW-STREAMLIT-APP.example/"
```

Voor oudere Supabase-projecten zijn ook deze namen ondersteund:

```toml
[supabase]
url = "https://JOUW-PROJECT.supabase.co"
anon_key = "eyJ..."
service_role_key = "eyJ..."
```

De `[auth]`-sectie met `cookie_password` is ook bij oudere Supabase-sleutels verplicht.
Gebruik minimaal 32 willekeurige tekens en hergebruik hiervoor nooit de Supabase
secret/service key. De waarde versleutelt de lokale refresh-token-cookie.

`oauth_redirect_url` is de publieke basis-URL van de Streamlit-app, zonder querystring
of fragment. Voor lokale ontwikkeling mag dit een loopback-URL met HTTP zijn. De app
maakt hiervan twee vaste callbacks:

```text
https://JOUW-STREAMLIT-APP.example/?auth_callback=1&provider=google
https://JOUW-STREAMLIT-APP.example/?auth_callback=1&provider=apple
```

Voeg deze exacte callback-URL's pas in de Supabase Auth allowlist toe voor de bedoelde
test- of productieomgeving. Google- en Apple-providercredentials worden afzonderlijk in
Supabase geconfigureerd en horen nooit in deze repository. Voor passwordless e-mail moet
de Supabase e-mailtemplate de eenmalige code (`{{ .Token }}`) tonen; de applicatie gebruikt
in V1 geen Magic Link.

Sla de Secrets op en reboot de Streamlit-app.

## 5. Bestanden naar GitHub pushen

Upload of commit minimaal:

```text
streamlit_app.py
planner.py
excel_export.py
database.py
supabase/config.toml
supabase/migrations/
requirements.txt
README.md
.streamlit/config.toml
.streamlit/secrets.toml.example
```

Commit **niet**:

```text
.streamlit/secrets.toml
```

Dit bestand staat al in `.gitignore`.

## 6. Streamlit deployen

Gebruik bij deployment:

```text
Branch: main
Main file path: streamlit_app.py
Python: 3.12
```

Na de eerste installatie van de nieuwe dependencies kan de app worden geopend.

## Lokaal starten

Maak optioneel `.streamlit/secrets.toml` aan op basis van het voorbeeldbestand.

Start eerst de lokale database en pas alle migrations vanaf nul toe:

```bash
supabase start
supabase db reset --local
```

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Installeer en start:

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Beschikbare banen

- Kremer Baan
- ZGA/F&F Baan
- PlaySeat Baan
- Seppworks/Bax Baan

## Beveiligingskeuzes

- Wachtwoorden worden door Supabase Auth verwerkt en niet in de eigen tabellen opgeslagen.
- De admin-API gebruikt alleen server-side de secret/service key.
- Participants gebruiken Google of Apple via één generieke Supabase OAuth/PKCE-flow,
  of een eenmalige zescijferige e-mailcode.
- PKCE-verifiers en refresh-tokens staan uitsluitend in afzonderlijk versleutelde
  browsercookies; callbackcodes worden direct uit de URL verwijderd.
- Openbare schema's bevatten geen rankings of berekende niveauvelden.
- Een account kan vanuit gebruikersbeheer worden gedeactiveerd.
- E-mail+wachtwoord blijft uitsluitend beschikbaar voor bestaande planner-/adminaccounts.

## Nog niet opgenomen

De eerste versie bevat nog geen:

- automatische wachtwoordreset;
- auditlog van wijzigingen;
- meerdere clubs of afzonderlijke clubomgevingen;
- verwijderknop voor opgeslagen schema's.

## Update: gedeelde spelerslijst en persoonlijk openbaar schema

De implementatie gebruikt `club_drafts` voor de gedeelde spelerslijst en instellingen.
De tabel en bijbehorende beveiliging zijn onderdeel van de initiële Supabase-baseline.
De plannerpagina toont wie de lijst het laatst heeft opgeslagen en bevat een knop om de
nieuwste versie opnieuw te laden.

Op de openbare pagina kan een deelnemer zijn of haar naam kiezen. De tabel toont dan per
ronde alleen de eigen wedstrijd of één duidelijke rustregel. Rankings en niveauwaarden
blijven verborgen.

## Update: optionele vanaf-tijd per speler

De spelerseditor bevat de optionele kolom **Vanaf tijd**. Laat deze leeg wanneer een
speler vanaf de start aanwezig is. Bij bijvoorbeeld `21:00` wordt de speler ingepland
vanaf de eerste wedstrijdronde die om of na 21:00 begint.

Belangrijk gedrag:

- vóór de vanaf-tijd staat de speler als **Nog niet aanwezig** in het schema;
- deze verplichte afwezigheid telt niet als een normale rustbeurt;
- de regel dat iemand niet twee echte rustbeurten achter elkaar krijgt blijft gelden;
- na aankomst verdeelt de planner de resterende wedstrijden zo eerlijk mogelijk op basis
  van het aantal rondes waarin iedere speler beschikbaar is;
- rankings en niveaus blijven verborgen op de openbare pagina;
- de persoonlijke naamfilter toont ook de status **Nog niet aanwezig**.

De vanaf-tijden worden als onderdeel van de gedeelde invoer opgeslagen in `club_drafts`.
Ze staan binnen de JSON-spelerslijst en vereisen daarom geen afzonderlijke kolom. Iedere
toekomstige structurele wijziging aan deze opslag moet wel als nieuwe migration worden
vastgelegd.

## Update: instelbare variatie in niveaus

Onder **Geavanceerde instellingen** staat nu de schuif **Variatie in niveaus**:

- `0`: spelers worden zoveel mogelijk met vergelijkbare niveaus op dezelfde baan gezet;
- `50`: gebalanceerde mix;
- `100`: de planner probeert bewust meer verschillende niveaus op dezelfde baan te zetten.

Ook bij een hoge waarde blijft de gemiddelde teamsterkte de belangrijkste voorwaarde. Een
indeling zoals niveau `5 + 3` tegen `5 + 3` krijgt dus de voorkeur boven een eenzijdige
wedstrijd. Zeer grote combinaties zoals `5 + 1` blijven extra strafpunten krijgen.

De instelling wordt opgeslagen in `club_drafts.level_mix`; deze kolom is onderdeel van
de initiële Supabase-baseline.
