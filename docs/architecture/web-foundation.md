# WEB-1: webfoundation

De nieuwe T.C. Zuid TOS-website wordt naast de bestaande Streamlit-app opgebouwd. In deze eerste stap bevat zij alleen een staging-shell en healthchecks; bestaande functionaliteit wordt nog niet geporteerd.

## Onderdelen

- **Next.js** in `apps/web/` is de nieuwe webfrontend en serverlaag. De App Router draait in productie als een compacte standalone Node-service.
- **FastAPI** in `services/planner-api/` wordt later de HTTP-adapter voor de bestaande Python-planner. `planner.py` blijft nu op zijn huidige plek en ongewijzigd, zodat de bewezen planner-engine en Streamlit-app tijdens de migratie stabiel blijven.
- **Supabase** blijft later verantwoordelijk voor Auth, PostgreSQL, RLS en RPC's. WEB-1 bevat nog geen Supabase-client of credentials.
- **Caddy** is de enige container met gepubliceerde hostpoorten. Caddy verzorgt automatische HTTPS en routeert intern naar Next.js en FastAPI.

## Stagingrouting

Staging gebruikt `test-tos.oddbounce.nl`:

- `/api/planner/*` gaat met verwijderde prefix naar FastAPI. Daardoor bereikt `/api/planner/health` intern FastAPI `/health`.
- alle overige routes gaan naar Next.js. Daardoor blijft `/api/health` de healthroute van de webservice.

Next.js en FastAPI publiceren geen hostpoorten en delen alleen het interne Compose-netwerk `application`. Caddy heeft daarnaast het netwerk `edge` nodig voor internetverkeer en TLS-certificaten. Alleen Caddy bewaart infrastructuurdata voor automatische HTTPS; er is geen persistente applicatiedata en geen lokale database.

Voor een lokale end-to-endcontrole kan `SITE_ADDRESS` tijdelijk op `http://:80` worden gezet. De stagingwaarde blijft standaard `test-tos.oddbounce.nl`; er is daarom geen `.env`-bestand nodig.

Beide Docker-buildcontexts zijn beperkt tot hun eigen applicatiemap. Bestanden buiten `apps/web/` respectievelijk `services/planner-api/` worden nooit naar de builder gestuurd. De `.dockerignore`-bestanden sluiten lokale env-bestanden, registryconfiguratie, credentials, private keys, caches en buildoutput expliciet uit. `NEXT_PUBLIC_*`-waarden worden tijdens `next build` permanent in de browserbundle ingebakken en mogen daarom nooit secrets bevatten.

## Reproduceerbare Python-dependencies

De FastAPI-service gebruikt `pip-tools==7.6.0` met Python 3.12.13. `requirements.in` en `requirements-dev.in` zijn de handmatig beheerde directe dependencies; de twee volledig opgeloste lockfiles bevatten transitieve versies en hashes. De productionimage installeert uitsluitend `requirements.lock` met `--require-hashes`. Testdependencies en pip-tools komen niet in die image.

Genereer de lockfiles vanuit `services/planner-api/` in een schone linux/amd64-container:

```sh
docker run --rm --platform linux/amd64 \
  --volume "$PWD:/src" --workdir /src \
  python:3.12.13-slim-bookworm \
  sh -c "python -m pip install pip-tools==7.6.0 && pip-compile --generate-hashes --no-emit-index-url --no-emit-trusted-host --strip-extras --resolver=backtracking --output-file=requirements.lock requirements.in && pip-compile --generate-hashes --no-emit-index-url --no-emit-trusted-host --strip-extras --resolver=backtracking --output-file=requirements-dev.lock requirements-dev.in"
```

Na een wijziging aan een `.in`-bestand moeten beide lockfiles bewust opnieuw worden gegenereerd en beoordeeld.

## Netwerkgrens vóór WEB-Auth

`application` is in WEB-1 bewust een intern Docker-netwerk: de huidige web- en plannerservices hebben geen externe runtimeafhankelijkheden. Vóór WEB-Auth heeft de Next.js-container gecontroleerde outbound HTTPS-toegang nodig voor Supabase Auth, SSR-cookieverversing en user-scoped databaseverzoeken. Daarvoor is geen publieke hostpoort op de webcontainer nodig. `planner-api` kan intern blijven. Deze netwerkgrens wordt vóór die fase opnieuw security-reviewed.

## Parallelle migratie

De bestaande Streamlit-app blijft volledig zelfstandig deploybaar. Nieuwe functionaliteit kan later gefaseerd naar Next.js en FastAPI verhuizen, terwijl Streamlit beschikbaar blijft totdat een expliciete migratiestap is getest en goedgekeurd. Productie krijgt later een afzonderlijke configuratie en aansluiting; de stagingconfiguratie is niet bedoeld als productieconfiguratie.

## Latere handmatige stagingdeployment

1. Laat DNS voor `test-tos.oddbounce.nl` naar de staging-VPS wijzen en zorg dat TCP 80/443 en UDP 443 bereikbaar zijn.
2. Installeer Docker Engine met de Compose-plugin op de VPS.
3. Controleer vóór de rollout de bestaande listeners en stacks met `sudo ss -ltnup`, `sudo docker compose ls` en `sudo docker ps`. Poorten 80/443 zijn momenteel nog in gebruik door de tijdelijke statische Caddy-stack onder `/opt/tos-staging-stack`.
4. Ga naar `/opt/tos-staging-stack`, controleer eerst het bijbehorende Composebestand en stop daarna uitsluitend die tijdelijke stack met `docker compose down`. Gebruik geen `--volumes`.
5. Clone de goedgekeurde commit of haal die op in een schone deploymentdirectory. De nieuwe configuratie gebruikt de vaste Compose-projectnaam `tc-zuid-tos-staging`; controleer met `docker compose ls` dat die naam nog niet door een andere stack wordt gebruikt.
6. Open `deploy/staging/` en valideer met `docker compose config`.
7. Controleer capaciteit met `free -h`, `swapon --show` en `df -h /`. Op de V2-VPS met circa 1,8 GiB RAM is 2 GiB swap sterk aanbevolen voordat lokaal images worden gebouwd.
8. Bouw nooit gelijktijdig: voer eerst `docker compose build --pull planner-api` uit en daarna `docker compose build --pull web`.
9. Start de stack met `docker compose up -d`.
10. Controleer `docker compose ps`, `https://test-tos.oddbounce.nl/api/health` en `https://test-tos.oddbounce.nl/api/planner/health`.
11. Bekijk bij problemen alleen de relevante logs met `docker compose logs web planner-api caddy`.

Een normale `docker compose down` behoudt de named volumes `caddy_data` en `caddy_config`. `docker compose down --volumes` verwijdert ook Caddy's ACME- en certificaatdata en mag daarom geen standaardonderdeel van deployments zijn. Vanaf WEB-Auth of zodra frontenddependencies merkbaar groeien, bouwen we de images bij voorkeur in CI en trekt de VPS alleen de goedgekeurde images binnen.

De base-images hebben exacte versietags. Digest-pinning wordt toegevoegd als latere CI/supply-chainverbetering, wanneer digests per doelplatform reproduceerbaar kunnen worden beheerd.

Deze stappen worden in WEB-1 niet uitgevoerd.
