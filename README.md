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

### Planner

Een planner kan:

- inloggen met e-mailadres en wachtwoord;
- de gedeelde spelerslijst en instellingen opslaan;
- dezelfde clubinvoer op desktop en telefoon terugvinden;
- schema's genereren en als Excel downloaden;
- schema's privé opslaan of openbaar publiceren;
- eigen opgeslagen schema's bekijken.

### Beheerder

Een beheerder kan daarnaast:

- planners en andere beheerders aanmaken;
- accounts activeren en deactiveren;
- alle opgeslagen schema's bekijken;
- publicaties beheren.

## Technische opbouw

```text
.
├── streamlit_app.py                 # Webinterface, publieke pagina en beheerschermen
├── planner.py                       # Plannings- en optimalisatielogica
├── excel_export.py                  # Excel-download
├── database.py                      # Supabase Auth en databasefuncties
├── supabase_schema.sql              # Tabellen, triggers en beveiliging
├── requirements.txt                 # Python-packages
├── test_planner.py                  # Rooktest van de planner
├── .gitignore
└── .streamlit/
    ├── config.toml                  # Huisstijl
    └── secrets.toml.example         # Voorbeeld zonder echte sleutels
```

## Waarom Supabase?

Streamlit Community Cloud garandeert niet dat lokaal opgeslagen bestanden behouden blijven. Daarom staan accounts, spelerslijsten en schema's in een externe PostgreSQL-database van Supabase.

De Supabase secret/service key staat uitsluitend in Streamlit Secrets en nooit in GitHub. Alle tabeltoegang loopt server-side via de Streamlit-app.

## 1. Supabase-project maken

1. Maak een Supabase-project.
2. Open **SQL Editor**.
3. Open lokaal `supabase_schema.sql`.
4. Kopieer de volledige inhoud naar de SQL Editor.
5. Klik op **Run**.

Hiermee worden aangemaakt:

- `profiles` voor rollen en accountstatus;
- `planner_drafts` voor oudere persoonlijke concepten;
- `club_drafts` voor de gedeelde spelerslijst en instellingen;
- `schedules` voor opgeslagen en gepubliceerde schema's.

Row Level Security wordt ingeschakeld. De tabellen hebben geen directe rechten voor anonieme of normale Supabase-clients; de Streamlit-server handelt de toegang af.

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
```

Voor oudere Supabase-projecten zijn ook deze namen ondersteund:

```toml
[supabase]
url = "https://JOUW-PROJECT.supabase.co"
anon_key = "eyJ..."
service_role_key = "eyJ..."
```

Sla de Secrets op en reboot de Streamlit-app.

## 5. Bestanden naar GitHub pushen

Upload of commit minimaal:

```text
streamlit_app.py
planner.py
excel_export.py
database.py
supabase_schema.sql
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
- Openbare schema's bevatten geen rankings of berekende niveauvelden.
- Een account kan vanuit gebruikersbeheer worden gedeactiveerd.
- De eerste versie gebruikt e-mailadres plus wachtwoord; dit is betrouwbaarder dan zelf een wachtwoordsysteem bouwen.

## Nog niet opgenomen

De eerste versie bevat nog geen:

- automatische wachtwoordreset;
- auditlog van wijzigingen;
- meerdere clubs of afzonderlijke clubomgevingen;
- verwijderknop voor opgeslagen schema's;
- permanente login-cookie na een volledig vernieuwde browsersessie.

## Update: gedeelde spelerslijst en persoonlijk openbaar schema

Voor een bestaande installatie voer je één keer `supabase_migration_shared_draft.sql`
uit via **Supabase > SQL Editor**. Daarna delen alle planners dezelfde laatst opgeslagen
invoer. De plannerpagina toont wie de lijst het laatst heeft opgeslagen en bevat een knop
om de nieuwste versie opnieuw te laden.

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
Daarvoor is geen nieuwe Supabase-migratie nodig, omdat de spelerslijst als JSON wordt
opgeslagen. Vervang alleen `streamlit_app.py`, `planner.py`, `excel_export.py` en
`test_planner.py`.
