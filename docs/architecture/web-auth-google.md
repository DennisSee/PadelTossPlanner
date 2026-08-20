# WEB-3B: Google OAuth met Supabase PKCE

WEB-3B voegt Google als snelle ingang toe aan dezelfde Supabase Auth-sessie die
WEB-3A al voor e-mail-OTP gebruikt. Er ontstaat geen aparte Google-, participant-
of staffsessie. OTP blijft de universele fallback.

## Flow en verantwoordelijkheden

De server bouwt de callback uitsluitend uit de gevalideerde `APP_BASE_URL` en
een returnpad uit de bestaande allowlist:

```text
browser /login
  -> supabase.auth.signInWithOAuth(provider=google, redirectTo=APP_BASE_URL/auth/callback)
  -> Supabase Auth / Google
  -> APP_BASE_URL/auth/callback?code=...&next=...
  -> exchangeCodeForSession(code)
  -> bestaande accountcontext en AUTH-2-capabilityfinalisatie
  -> /tos, /account, /beheer of /live
```

De browser vertrouwt geen `Host`- of `X-Forwarded-Host`-header. Hij accepteert
alleen een server-aangeleverde callback met exact zijn eigen runtime-origin,
`/auth/callback` en één gesanitized `next`. De callbackroute behandelt `code`,
providerfouten en `next` als onbetrouwbare invoer. Hij wacht de officiële SDK-
exchange volledig af en hergebruikt daarna dezelfde provider-onafhankelijke
finalisatiehelper als `/auth/complete` voor OTP.

De returnallowlist blijft `/tos`, `/account`, `/beheer` en `/live`, met `/tos`
als default. Absolute, protocol-relative, encoded externe, onbekende en control-
characterpaden vallen terug op `/tos`. De bestaande capabilityloader bepaalt of
`/beheer` werkelijk is toegestaan; een participant krijgt de veilige fallback.

## Providerconfiguratie en scopes

Google client-ID en clientsecret horen uitsluitend in de Google-providerconfig
van het bedoelde Supabase-project. Ze staan niet in Next.js, Compose, de VPS,
Git of browserprops. De applicatie vraagt geen aanvullende Google API-scopes,
geen `access_type=offline` en bewaart geen Google access- of refresh-token.
Supabase blijft verantwoordelijk voor de geverifieerde identity en voor veilig
linken van identities. De applicatie implementeert geen eigen merge.

Na login gebruikt de applicatie uitsluitend de geverifieerde Supabase user-id en
het bestaande profiel/membermodel onder RLS. Google-providermetadata bepaalt
nooit `profiles.role`, `member_id`, approval, capabilities of de zichtbare
profielnaam en overschrijft `profiles.display_name` niet.

## PKCE, cookies en logout

`@supabase/ssr` en de officiële Supabase Auth-SDK beheren de PKCE-verifier,
providerredirect, code-exchange, sessiechunking en cleanup. De applicatie bouwt
geen eigen verifiercookie of cookiesweeper. De browserclient laat de SDK haar
gereserveerde `sb_flow_id` aan de callback toevoegen; de callback geeft die
begrensde flow-ID terug aan `exchangeCodeForSession`, zodat de SDK exact de
bijbehorende verifier en indexentry opruimt. Browser-, server- en Proxy-clients
gebruiken het centrale WEB-3A.3-cookiecontract:

- `Path=/`;
- `SameSite=Lax`;
- `Secure=true` op HTTPS;
- `Secure=false` uitsluitend voor HTTP op localhost/loopback;
- geen `Domain`;
- geen handmatig geforceerde `HttpOnly`.

Logout gebruikt dezelfde Supabase-sessie en verwijdert via de SDK zowel
sessiechunks als geïndexeerde en legacy PKCE-flowcookies. Niet-Auth-appcookies
blijven behouden. Codes, verifiers, sessietokens en providerfouten worden niet
gelogd of als applicatiedata opgeslagen.

## Foutafhandeling

Annuleren, ontbrekende of ongeldige code, exchangefouten en onbeschikbare
runtimeconfig falen gesloten. De loginroute krijgt alleen de beperkte categorie
`error=oauth` met een gesanitized `next`; de gebruiker ziet uitsluitend:

> Inloggen met Google is niet gelukt. Probeer het opnieuw of gebruik een
> e-mailcode.

Raw Google-/Supabasefouten, `error_description`, e-mailadressen, codes en tokens
komen niet in de pagina of logs. Bij een ontbrekend of inconsistent profiel
blijft de bestaande accountcontext fail-closed.

## Lokale testmatrix

Unit- en componenttests dekken de Googleknop, same-origin callbackopbouw,
returnpaths, veilige fouten, callback-exchange, gedeelde finalisatie,
PKCE-cookielevenscyclus, homepage-CTA en e-mailinputattributen. De lokale
Playwrightmock doorloopt de echte Supabase SDK-PKCE-flow met een eenmalige code
en valideert op 390 en 1440 px:

- succes naar default `/tos`, `/account`, staff `/beheer` en `/live`;
- participantfallback bij `/beheer`;
- annuleren, exchangefout en malicious `next`;
- refresh, logout en PKCE-cookiecleanup;
- dezelfde mockidentity na OTP en Google zonder wijziging van profiel/capability;
- OTP-regressie, homepagevarianten en horizontale overflow.

OS- en toetsenbord-autofillsuggesties kunnen niet door de website worden
gegarandeerd. Het e-mailveld biedt daarvoor wel het normale formuliercontract:
`id/name=email`, `type/inputmode=email`, `autocomplete=email`, geen autocapitals,
geen spellcheck en een send-enterhint.

## Handmatige configuratiechecklist

Gebruik per omgeving uitsluitend de daadwerkelijke waarden in de beheerschermen;
kopieer ze niet naar Git, documentatie, logs of tickets.

1. Maak of selecteer in Google Cloud de OAuth webclient voor het bedoelde
   stagingproject.
2. Neem in Google Cloud exact de Supabase provider-callback op die het Supabase
   Dashboard voor dat project toont.
3. Activeer Google in **Supabase Dashboard → Authentication → Providers** en
   voer daar uitsluitend client-ID en clientsecret in.
4. Stel de Supabase Site URL in op de exacte staging-origin en controleer in
   **Authentication → URL Configuration** dat de appcallback inclusief de door
   de SDK toegevoegde `sb_flow_id`-query wordt toegestaan.
5. Behoud op de webserver alleen de bestaande `APP_BASE_URL`, `SUPABASE_URL` en
   publishable key; voeg geen Googlecredential toe.
6. Test met een nieuw Google-account, een bestaand OTP-account met hetzelfde
   geverifieerde e-mailadres, participant, planner/admin, annuleren en logout.
7. Controleer in de HTTPS-browser zonder waarden te kopiëren dat Auth-cookies
   host-only, `Secure`, `SameSite=Lax` en `Path=/` zijn en na logout verdwijnen.

## Niet geïmplementeerd

WEB-3B bevat geen One Tap, Apple, passkeys, extra Google API-toegang,
provider-tokenopslag, handmatige identitymerge, nieuwe rolarchitectuur,
databasewijziging, migration of RLS-wijziging. Een echte providerlogin en het
linken van een bestaand OTP-account blijven verplichte stagingvalidaties.
