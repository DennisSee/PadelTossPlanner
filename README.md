# TOS Padelplanner

Een eenvoudige Streamlit-webapp die een gebalanceerd padelschema maakt op basis van:

- start- en eindtijd;
- wedstrijdduur;
- spelers en rankings van 1 tot en met 5;
- één tot vier geselecteerde banen;
- eerlijke verdeling van wedstrijden en rustbeurten.

De planner voorkomt standaard dat spelers opnieuw met dezelfde partner spelen en dat iemand twee rondes achter elkaar rust.

## Beschikbare banen

- Kremer Baan
- ZGA/F&F Baan
- PlaySeat Baan
- Seppworks/Bax Baan

## Repositorystructuur

```text
.
├── streamlit_app.py       # Webinterface en invoervelden
├── planner.py             # Plannings- en optimalisatielogica
├── excel_export.py        # Downloadbaar Excelbestand
├── requirements.txt       # Python-packages voor Streamlit Cloud
├── .gitignore
└── .streamlit/
    └── config.toml        # Eenvoudige huisstijl
```

## Lokaal starten

Gebruik bij voorkeur Python 3.12.

```bash
python -m venv .venv
```

Activeer de omgeving op Windows:

```bash
.venv\Scripts\activate
```

Of op macOS/Linux:

```bash
source .venv/bin/activate
```

Installeer de packages:

```bash
pip install -r requirements.txt
```

Start de app:

```bash
streamlit run streamlit_app.py
```

De app opent normaal op `http://localhost:8501`.

## Deployen op Streamlit Community Cloud

1. Plaats alle bestanden in de root van je GitHub-repository.
2. Open Streamlit Community Cloud en kies **Create app**.
3. Selecteer je repository en de branch `main`.
4. Vul bij **Main file path** in: `streamlit_app.py`.
5. Kies in **Advanced settings** Python 3.12.
6. Klik op **Deploy**.

Er zijn voor deze versie geen secrets, database of externe Linux-packages nodig.

## Gebruik

1. Kies starttijd, eindtijd en wedstrijdduur.
2. Selecteer de beschikbare banen.
3. Vul spelers en rankings in. Gebruik **Meedoen** om een speler tijdelijk uit te zetten.
4. Klik op **Schema genereren**.
5. Bekijk het schema en de spelersstatistieken.
6. Download het resultaat als Excelbestand.

## Zoekkwaliteit

- **Snel**: geschikt om invoer te testen.
- **Normaal**: aanbevolen voor de meeste clubavonden.
- **Uitgebreid**: probeert meer schema's en kan daardoor langer rekenen.

Bij een onmogelijke combinatie toont de app een foutmelding met een mogelijke oplossing, zoals minder rondes of het toestaan van dubbele partners.
