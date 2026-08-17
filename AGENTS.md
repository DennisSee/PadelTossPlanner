# Veilige projectregels

## Reikwijdte

- Deze regels gelden voor de volledige repository.
- Houd `planner.py` vrij van Streamlit-, database- en exportlogica.
- Wijzig functioneel gedrag alleen wanneer de opdracht dat expliciet vraagt.
- Behoud de scheiding tussen private en publieke schemagegevens; rankings en
  niveauvelden mogen nooit via de publieke projectie worden gepubliceerd.

## Git-workflow

- Werk op een feature branch en niet rechtstreeks op `main`.
- Maak kleine, beoordeelbare wijzigingen en controleer altijd `git diff` en
  `git status` voordat werk wordt overgedragen.
- Commit, push, merge, deploy of maak geen pull request zonder expliciete
  toestemming van de gebruiker.
- Overschrijf of verwijder geen bestaande gebruikerswijzigingen.

## Tests en dependencies

- Productiepackages horen in `requirements.txt`; ontwikkel- en testpackages in
  `requirements-dev.txt`.
- Voer na Python-wijzigingen minimaal een syntaxcontrole en `pytest` uit.
- Voeg bij nieuw of gewijzigd gedrag gerichte tests toe. Houd tests
  deterministisch door vaste random seeds te gebruiken.
- Een wijziging is pas gereed wanneer de volledige testsuite slaagt.

## Supabase en secrets

- Raak geen gekoppeld of remote Supabase-project aan zonder een expliciete,
  afzonderlijke opdracht en bevestiging van het exacte doelproject.
- Productie-Supabase mag nooit worden gewijzigd zonder expliciete toestemming
  voor de concrete wijziging en bevestiging van het productieproject.
- Voer tijdens normale ontwikkeling geen SQL uit in de Supabase SQL Editor en
  gebruik geen remote `db push`, `db reset`, `migration repair` of vergelijkbare
  muterende commando's.
- Leg toekomstige schemawijzigingen vast als beoordeelbare, versiebeheerbare
  migrations en test ze eerst tegen een lokale of tijdelijke database.
- Commit nooit `.streamlit/secrets.toml`, `.env`, API-sleutels, refresh-tokens of
  service-role secrets. Gebruik uitsluitend placeholders in voorbeeldbestanden.
- Gebruik voor test- en stagingomgevingen andere credentials dan voor productie.

## Controle vóór overdracht

- Controleer dat applicatiecode alleen is gewijzigd wanneer dat in scope was.
- Controleer dat publieke opslag geen private velden bevat.
- Rapporteer uitgevoerde tests, de actuele branch en alle niet-gecommitte wijzigingen.
